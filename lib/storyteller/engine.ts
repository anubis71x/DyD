import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { applyEvents } from "@/lib/save/reducer";
import type { SaveEvent } from "@/lib/save/schema";
import { commitEvents, loadCampaign } from "@/lib/save/service";
import type { PlaySession, Stores } from "@/lib/save/store";
import { checkOutcome, describeRoll, DiceError, roll } from "./dice";
import type { TableEvent, TurnInput } from "./events";
import { buildSystemPrompt, sessionOpening } from "./prompt";
import { SayParser } from "./sayParser";
import { getStoryteller } from "./storytellers";
import { runTool, TOOL_PARAMS } from "./tools";

export const ENGINE_CONFIG = {
  model: process.env.STORYTELLER_MODEL || "claude-opus-5-5",
  // Spoken, conversational replies: low effort keeps turns fast. Raise it
  // with STORYTELLER_EFFORT if scenes feel thin.
  effort: (process.env.STORYTELLER_EFFORT || "low") as "low" | "medium" | "high" | "xhigh" | "max",
  maxTokens: 16000,
  maxToolRounds: 8,
  coinsPerTurn: Number(process.env.COINS_PER_TURN ?? 1),
  sessionIdleMs: 6 * 60 * 60 * 1000,
};

export interface TurnDeps {
  stores: Stores;
  client: Anthropic;
  emit: (e: TableEvent) => void;
  rng?: (sides: number) => number;
  signal?: AbortSignal;
}

const asMessages = (m: unknown[]) => m as BetaMessageParam[];

async function getOrStartSession(stores: Stores, ownerId: string, campaignId: string, now: Date) {
  const latest = await stores.sessions.latest(ownerId, campaignId);
  const fresh =
    latest && !latest.endedAt && now.getTime() - new Date(latest.lastActiveAt).getTime() < ENGINE_CONFIG.sessionIdleMs;
  if (latest && fresh) return { session: latest, isNew: false };
  if (latest && !latest.endedAt) await stores.sessions.update(ownerId, latest.sessionId, { endedAt: now.toISOString() });
  const session: PlaySession = {
    sessionId: randomUUID(),
    campaignId,
    ownerId,
    sessionNo: (await stores.sessions.count(ownerId, campaignId)) + 1,
    messages: [],
    startedAt: now.toISOString(),
    lastActiveAt: now.toISOString(),
  };
  await stores.sessions.create(session);
  return { session, isNew: true };
}

/** Turn the player's input into message text, rolling dice server-side. */
function playerContent(input: TurnInput, deps: TurnDeps): { text: string | null; error?: string } {
  switch (input.type) {
    case "begin":
      return { text: null };
    case "text":
      return { text: `<player>${input.text.trim().slice(0, 2000)}</player>` };
    case "choice":
      return { text: `<player>${input.text.trim().slice(0, 200)}</player>` };
    case "roll": {
      try {
        const r = roll(input.notation, input.advantage ?? "none", deps.rng);
        const outcome = checkOutcome(r, input.dc);
        deps.emit({ type: "dice", by: "player", label: input.label, roll: r, ...(input.dc !== undefined ? { dc: input.dc } : {}), ...(outcome ? { outcome } : {}) });
        return { text: `[Dice] ${describeRoll(r, input.label.slice(0, 80), input.dc)}` };
      } catch (e) {
        if (e instanceof DiceError) return { text: null, error: e.message };
        throw e;
      }
    }
  }
}

/**
 * Run one player turn: append the player's input, then loop model → tools
 * until the storyteller hands the scene back. Every message is stored as
 * received so the history stays append-only (thinking blocks are only valid
 * in an unedited conversation).
 */
export async function runTurn(ownerId: string, campaignId: string, input: TurnInput, deps: TurnDeps): Promise<void> {
  const { stores, client, emit } = deps;
  let save = await loadCampaign(stores, ownerId, campaignId);
  const st = getStoryteller(save.storytellerId);

  const { text: playerText, error } = playerContent(input, deps);
  if (error) {
    emit({ type: "error", code: "invalid_input", message: error });
    return;
  }

  const { session, isNew } = await getOrStartSession(stores, ownerId, campaignId, new Date());
  if (!isNew && !playerText) {
    // "begin" on a session already in progress: nothing to send.
    emit({ type: "done", coins: await stores.wallet.balance(ownerId) });
    return;
  }

  if (!(await stores.wallet.debit(ownerId, ENGINE_CONFIG.coinsPerTurn))) {
    emit({ type: "error", code: "out_of_coins", message: "You're out of coins. Add more to keep playing." });
    return;
  }
  emit({ type: "turn.start", sessionNo: session.sessionNo });

  const content: BetaContentBlockParam[] = [];
  if (isNew) content.push({ type: "text", text: sessionOpening(save, session.sessionNo) });
  if (playerText) content.push({ type: "text", text: playerText });
  const messages = asMessages(session.messages);
  messages.push({ role: "user", content });

  const persist = () =>
    stores.sessions.update(ownerId, session.sessionId, { messages, lastActiveAt: new Date().toISOString() });

  let produced = false;
  try {
    for (let round = 0; round < ENGINE_CONFIG.maxToolRounds; round++) {
      const parser = new SayParser();
      const forward = (pieces: ReturnType<SayParser["push"]>) => {
        for (const p of pieces) emit({ type: "speech", speaker: p.speaker, ...(p.mood ? { mood: p.mood } : {}), text: p.text });
      };

      const stream = client.beta.messages.stream(
        {
          model: ENGINE_CONFIG.model,
          max_tokens: ENGINE_CONFIG.maxTokens,
          system: [{ type: "text", text: buildSystemPrompt(st), cache_control: { type: "ephemeral" } }],
          tools: TOOL_PARAMS,
          messages,
          output_config: { effort: ENGINE_CONFIG.effort },
          cache_control: { type: "ephemeral" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal: deps.signal },
      );
      stream.on("text", (delta) => {
        produced = true;
        forward(parser.push(delta));
      });

      let message: BetaMessage;
      try {
        message = await stream.finalMessage();
      } catch (err) {
        // A tool input that could not be parsed at all: re-issue the round once.
        if (!(err instanceof Anthropic.APIError) && round === 0 && !produced) continue;
        throw err;
      }
      forward(parser.flush());
      emit({ type: "speech.end" });

      messages.push({ role: "assistant", content: message.content });
      await persist();
      produced = true;

      if (message.stop_reason === "refusal") {
        emit({ type: "error", code: "refused", message: "The storyteller couldn't continue that scene. Try steering the story another way." });
        break;
      }
      if (message.stop_reason === "pause_turn") continue;

      const toolUses = message.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use");
      if (!toolUses.length) break;
      if (message.stop_reason === "max_tokens") {
        emit({ type: "error", code: "upstream", message: "The storyteller's reply was cut off. Please try again." });
        break;
      }

      // Run every tool in the batch against an in-memory copy, then commit once.
      const now = new Date().toISOString();
      let working = save;
      const pending: SaveEvent[] = [];
      const ui: TableEvent[] = [];
      const results: BetaToolResultBlockParam[] = [];
      let yieldToPlayer = false;
      for (const call of toolUses) {
        const out = runTool(call.name, call.input, { save: working, now, rng: deps.rng });
        if (out.events.length) {
          working = applyEvents(working, out.events, now);
          pending.push(...out.events);
        }
        ui.push(...out.ui);
        yieldToPlayer ||= !!out.yieldToPlayer;
        results.push({ type: "tool_result", tool_use_id: call.id, content: out.result, ...(out.isError ? { is_error: true } : {}) });
      }
      if (pending.length) {
        save = await commitEvents(stores, ownerId, campaignId, pending, "tool");
        emit({ type: "state", save });
      }
      ui.forEach(emit);

      // All results go back in a single user message.
      messages.push({ role: "user", content: results });
      await persist();
      if (yieldToPlayer) break;
    }
  } catch (err) {
    if (!produced) await stores.wallet.credit(ownerId, ENGINE_CONFIG.coinsPerTurn);
    // Keep the stored history valid: drop a trailing user message the model never answered.
    if (!produced && messages[messages.length - 1]?.role === "user") {
      messages.pop();
      await persist();
    }
    if (err instanceof Anthropic.APIError || (err as Error)?.name === "AbortError") {
      emit({ type: "error", code: "upstream", message: "The storyteller is unavailable right now. Your coin was refunded if nothing was said." });
      console.error("[storyteller] API error", err instanceof Anthropic.APIError ? err.status : "", (err as Error).message);
      return;
    }
    throw err;
  }

  emit({ type: "done", coins: await stores.wallet.balance(ownerId) });
}
