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
import type { PlaySession, SessionUsage, Stores } from "@/lib/save/store";
import { checkOutcome, describeRoll, DiceError, roll } from "./dice";
import type { TableEvent, TurnInput } from "./events";
import { buildSystemPrompt, sessionOpening } from "./prompt";
import { SayParser } from "./sayParser";
import { getModel, type StorytellerModel } from "./models";
import { getStoryteller } from "./storytellers";
import { runTool, TOOL_PARAMS } from "./tools";

export const ENGINE_CONFIG = {
  maxTokens: 16000,
  maxToolRounds: 8,
  sessionIdleMs: 6 * 60 * 60 * 1000,
};

/** Request fields that depend on the chosen model. */
export function modelParams(model: StorytellerModel) {
  return {
    model: model.apiModel,
    output_config: { effort: model.effort },
    // Haiku 5.5 has no server-side fallback; sending `fallbacks` to it is wrong.
    ...(model.serverFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

const EMPTY_USAGE: SessionUsage = { turns: 0, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, coins: 0 };

function addUsage(prev: SessionUsage | undefined, u: BetaMessage["usage"]): SessionUsage {
  const base = prev ?? EMPTY_USAGE;
  return {
    ...base,
    calls: base.calls + 1,
    inputTokens: base.inputTokens + (u?.input_tokens ?? 0),
    outputTokens: base.outputTokens + (u?.output_tokens ?? 0),
    cacheReadTokens: base.cacheReadTokens + (u?.cache_read_input_tokens ?? 0),
    cacheWriteTokens: base.cacheWriteTokens + (u?.cache_creation_input_tokens ?? 0),
  };
}

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
  const model = getModel(save.modelId);
  const cost = model.coinsPerTurn;

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

  if (!(await stores.wallet.debit(ownerId, cost))) {
    const msg = cost > 1
      ? `A turn with ${model.name} costs ${cost} coins and you don't have enough. Add coins or switch to a lighter model.`
      : "You're out of coins. Add more to keep playing.";
    emit({ type: "error", code: "out_of_coins", message: msg });
    return;
  }
  emit({ type: "turn.start", sessionNo: session.sessionNo });

  const content: BetaContentBlockParam[] = [];
  if (isNew) content.push({ type: "text", text: sessionOpening(save, session.sessionNo) });
  if (playerText) content.push({ type: "text", text: playerText });
  const messages = asMessages(session.messages);
  messages.push({ role: "user", content });

  // Per-model running totals for this session (real cost data for pricing coins).
  const usage = { ...(session.usage ?? {}) };
  const prev = usage[model.id] ?? EMPTY_USAGE;
  usage[model.id] = { ...prev, turns: prev.turns + 1, coins: prev.coins + cost };

  const persist = () =>
    stores.sessions.update(ownerId, session.sessionId, { messages, usage, lastActiveAt: new Date().toISOString() });

  let produced = false;
  try {
    for (let round = 0; round < ENGINE_CONFIG.maxToolRounds; round++) {
      const parser = new SayParser();
      const forward = (pieces: ReturnType<SayParser["push"]>) => {
        for (const p of pieces) emit({ type: "speech", speaker: p.speaker, ...(p.mood ? { mood: p.mood } : {}), text: p.text });
      };

      const stream = client.beta.messages.stream(
        {
          ...modelParams(model),
          max_tokens: ENGINE_CONFIG.maxTokens,
          system: [{ type: "text", text: buildSystemPrompt(st), cache_control: { type: "ephemeral" } }],
          tools: TOOL_PARAMS,
          messages,
          cache_control: { type: "ephemeral" },
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
      usage[model.id] = addUsage(usage[model.id], message.usage);
      await persist();
      produced = true;

      if (message.stop_reason === "refusal") {
        emit({
          type: "error",
          code: "refused",
          message: model.serverFallback
            ? "The storyteller couldn't continue that scene. Try steering the story another way."
            : `${model.name} couldn't continue that scene. Try steering the story another way, or switch to a different model.`,
        });
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
    if (!produced) {
      await stores.wallet.credit(ownerId, cost);
      const u = usage[model.id];
      usage[model.id] = { ...u, turns: u.turns - 1, coins: u.coins - cost };
    }
    // Keep the stored history valid: drop a trailing user message the model never answered.
    if (!produced && messages[messages.length - 1]?.role === "user") {
      messages.pop();
    }
    await persist();
    if (err instanceof Anthropic.APIError || (err as Error)?.name === "AbortError") {
      emit({ type: "error", code: "upstream", message: produced ? "The storyteller stopped partway. What was said is saved." : "The storyteller is unavailable right now. Your coins were refunded." });
      console.error("[storyteller] API error", err instanceof Anthropic.APIError ? err.status : "", (err as Error).message);
      return;
    }
    throw err;
  }

  emit({ type: "done", coins: await stores.wallet.balance(ownerId) });
}
