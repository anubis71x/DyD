import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { formatUsd } from "@/lib/billing/money";
import { estimateTokens, holdMicros, MARKUP, responseCost, withMarkup, type CostLine } from "@/lib/billing/pricing";
import { applyEvents } from "@/lib/save/reducer";
import type { SaveEvent } from "@/lib/save/schema";
import { commitEvents, loadCampaign } from "@/lib/save/service";
import type { PlaySession, SessionUsage, Stores } from "@/lib/save/store";
import { checkOutcome, describeRoll, DiceError, parseNotation, roll } from "./dice";
import type { TableEvent, TurnInput } from "./events";
import { getModel, type StorytellerModel } from "./models";
import { buildSystemPrompt, sessionOpening } from "./prompt";
import { hasStory, RECAP_MODEL, summarizeSession } from "./recap";
import { SayParser } from "./sayParser";
import { getStoryteller } from "./storytellers";
import { runTool, TOOL_PARAMS } from "./tools";

export const ENGINE_CONFIG = {
  maxTokens: 16000,
  maxToolRounds: 8,
  /** A session idle this long is closed (with a recap) and the next turn starts a new one. */
  sessionIdleMs: 6 * 60 * 60 * 1000,
  /**
   * A session whose history passes this many (estimated) tokens is closed with
   * a recap and continued in a fresh session. Keeps turns fast and every prompt
   * well under Haiku 5.5's 100K-token price step.
   */
  rolloverTokens: 60_000,
  /** Holds older than this were left by a crashed turn and are released. */
  staleHoldMs: 15 * 60 * 1000,
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

export interface TurnDeps {
  stores: Stores;
  client: Anthropic;
  emit: (e: TableEvent) => void;
  rng?: (sides: number) => number;
  signal?: AbortSignal;
}

const EMPTY_USAGE: SessionUsage = {
  turns: 0,
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  providerMicros: 0,
  chargedMicros: 0,
};

const asMessages = (m: unknown[]) => m as BetaMessageParam[];

/**
 * End a session: write its recap to the save file (charged like a turn, at
 * cost + markup) and mark it ended. A failed recap doesn't block anything;
 * the session still ends.
 */
export async function closeSession(
  ownerId: string,
  campaignId: string,
  session: PlaySession,
  deps: Pick<TurnDeps, "stores" | "client" | "emit">,
): Promise<void> {
  const { stores, emit } = deps;
  const now = new Date().toISOString();
  if (!session.recappedAt && hasStory(session.messages)) {
    try {
      const save = await loadCampaign(stores, ownerId, campaignId);
      const { event, costLines } = await summarizeSession(deps.client, save, session.sessionNo, session.messages, now);
      const providerMicros = costLines.reduce((sum, l) => sum + l.micros, 0);
      const charge = withMarkup(providerMicros);
      if (charge > 0) {
        await stores.wallet.post({
          refId: `recap:${session.sessionId}`,
          userId: ownerId,
          amountMicros: -charge,
          kind: "charge",
          meta: { campaignId, sessionId: session.sessionId, purpose: "recap", model: RECAP_MODEL, providerMicros, markup: MARKUP, lines: costLines },
        });
      }
      if (event) {
        await commitEvents(stores, ownerId, campaignId, [event], "system");
        await stores.sessions.update(ownerId, session.sessionId, { recappedAt: now });
        emit({ type: "notice", message: `Session ${session.sessionNo} recorded in your journal.` });
      }
    } catch (err) {
      console.error("[recap] failed", err instanceof Anthropic.APIError ? err.status : "", (err as Error).message);
    }
  }
  if (!session.endedAt) await stores.sessions.update(ownerId, session.sessionId, { endedAt: now });
}

/** End the active session on request (the player chose "End session"). */
export async function endSession(ownerId: string, campaignId: string, deps: Pick<TurnDeps, "stores" | "client" | "emit">): Promise<boolean> {
  const latest = await deps.stores.sessions.latest(ownerId, campaignId);
  if (!latest || latest.endedAt) return false;
  await closeSession(ownerId, campaignId, latest, deps);
  return true;
}

async function getOrStartSession(ownerId: string, campaignId: string, now: Date, deps: TurnDeps) {
  const { stores } = deps;
  const latest = await stores.sessions.latest(ownerId, campaignId);
  let continuing = false;
  if (latest && !latest.endedAt) {
    const idle = now.getTime() - new Date(latest.lastActiveAt).getTime() >= ENGINE_CONFIG.sessionIdleMs;
    const tooLong = estimateTokens(JSON.stringify(latest.messages)) > ENGINE_CONFIG.rolloverTokens;
    if (!idle && !tooLong) return { session: latest, isNew: false, continuing: false };
    continuing = tooLong && !idle;
    await closeSession(ownerId, campaignId, latest, deps);
  }
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
  return { session, isNew: true, continuing };
}

/** Check the player's input before any money moves. Returns an error message or null. */
function validateInput(input: TurnInput): string | null {
  if (input.type !== "roll") return null;
  try {
    parseNotation(input.notation);
    return null;
  } catch (e) {
    if (e instanceof DiceError) return e.message;
    throw e;
  }
}

/** Turn the player's input into message text, rolling dice server-side. */
function playerContent(input: TurnInput, deps: TurnDeps): string | null {
  switch (input.type) {
    case "begin":
      return null;
    case "text":
      return `<player>${input.text.trim().slice(0, 2000)}</player>`;
    case "choice":
      return `<player>${input.text.trim().slice(0, 200)}</player>`;
    case "roll": {
      const r = roll(input.notation, input.advantage ?? "none", deps.rng);
      const outcome = checkOutcome(r, input.dc);
      deps.emit({ type: "dice", by: "player", label: input.label, roll: r, ...(input.dc !== undefined ? { dc: input.dc } : {}), ...(outcome ? { outcome } : {}) });
      return `[Dice] ${describeRoll(r, input.label.slice(0, 80), input.dc)}`;
    }
  }
}

/**
 * Run one player turn: append the player's input, then loop model → tools
 * until the storyteller hands the scene back. Every message is stored as
 * received so the history stays append-only (thinking blocks are only valid
 * in an unedited conversation).
 *
 * Billing: before the turn, a worst-case amount is held from the player's
 * balance. Afterwards the hold is released and the real provider cost of the
 * calls that completed, plus MARKUP, is charged.
 */
export async function runTurn(ownerId: string, campaignId: string, input: TurnInput, deps: TurnDeps): Promise<void> {
  const { stores, client, emit } = deps;
  let save = await loadCampaign(stores, ownerId, campaignId);
  const st = getStoryteller(save.storytellerId);
  const model = getModel(save.modelId);
  const systemPrompt = buildSystemPrompt(st);

  const invalid = validateInput(input);
  if (invalid) {
    emit({ type: "error", code: "invalid_input", message: invalid });
    return;
  }

  // Money left in holds by a turn that crashed goes back to the player first.
  await stores.wallet.releaseStaleHolds(ownerId, ENGINE_CONFIG.staleHoldMs);

  const { session, isNew, continuing } = await getOrStartSession(ownerId, campaignId, new Date(), deps);
  if (isNew) save = await loadCampaign(stores, ownerId, campaignId); // may now include the last recap
  if (!isNew && input.type === "begin") {
    // "begin" on a session already in progress: nothing to send.
    emit({ type: "done", balanceMicros: await stores.wallet.balance(ownerId), turnCostMicros: 0 });
    return;
  }

  const messages = asMessages(session.messages);
  const opening = isNew ? sessionOpening(save, session.sessionNo, { continuing }) : "";

  // Hold enough for a long turn before anything is sent or rolled.
  const turnId = randomUUID();
  const promptTokens = estimateTokens(systemPrompt + JSON.stringify(TOOL_PARAMS) + JSON.stringify(messages) + opening) + 600;
  const hold = holdMicros(model.apiModel, promptTokens);
  const held = await stores.wallet.post({
    refId: `turn:${turnId}:hold`,
    userId: ownerId,
    amountMicros: -hold,
    kind: "hold",
    requireFunds: true,
    meta: { campaignId, model: model.apiModel },
  });
  if (held !== "ok") {
    const balance = await stores.wallet.balance(ownerId);
    const cheaper = model.id !== "haiku" ? " or switch to Claude Haiku 5.5" : "";
    emit({
      type: "error",
      code: "insufficient_funds",
      message: `A turn on ${model.name} needs ${formatUsd(hold)} available and your balance is ${formatUsd(balance)}. Add funds${cheaper} to keep playing. You're only charged what the turn actually costs.`,
    });
    return;
  }

  const content: BetaContentBlockParam[] = [];
  if (opening) content.push({ type: "text", text: opening });
  const playerText = playerContent(input, deps);
  if (playerText) content.push({ type: "text", text: playerText });
  messages.push({ role: "user", content });
  emit({ type: "turn.start", sessionNo: session.sessionNo });

  // Cost of every completed API call this turn.
  const costLines: CostLine[] = [];
  const usage = { ...(session.usage ?? {}) };
  const persist = () =>
    stores.sessions.update(ownerId, session.sessionId, { messages, usage, lastActiveAt: new Date().toISOString() });

  let produced = false;
  let failure: unknown = null;
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
          system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
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

      costLines.push(...responseCost(model.apiModel, message.usage));
      const u = usage[model.id] ?? EMPTY_USAGE;
      usage[model.id] = {
        ...u,
        calls: u.calls + 1,
        inputTokens: u.inputTokens + message.usage.input_tokens,
        outputTokens: u.outputTokens + message.usage.output_tokens,
        cacheReadTokens: u.cacheReadTokens + (message.usage.cache_read_input_tokens ?? 0),
        cacheWriteTokens: u.cacheWriteTokens + (message.usage.cache_creation_input_tokens ?? 0),
      };
      messages.push({ role: "assistant", content: message.content });
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
    failure = err;
    // Keep the stored history valid: drop a trailing user message the model never answered.
    if (!produced && messages[messages.length - 1]?.role === "user") messages.pop();
  }

  // Settle: release the hold, charge what the completed calls cost plus markup.
  const providerMicros = costLines.reduce((sum, l) => sum + l.micros, 0);
  const charge = withMarkup(providerMicros);
  await stores.wallet.post({ refId: `turn:${turnId}:release`, userId: ownerId, amountMicros: hold, kind: "release", meta: { campaignId } });
  if (charge > 0) {
    await stores.wallet.post({
      refId: `turn:${turnId}:charge`,
      userId: ownerId,
      amountMicros: -charge,
      kind: "charge",
      meta: {
        campaignId,
        sessionId: session.sessionId,
        model: model.apiModel,
        providerMicros,
        markup: MARKUP,
        lines: costLines,
      },
    });
  }
  const u = usage[model.id] ?? EMPTY_USAGE;
  usage[model.id] = {
    ...u,
    turns: u.turns + (costLines.length ? 1 : 0),
    providerMicros: u.providerMicros + providerMicros,
    chargedMicros: u.chargedMicros + charge,
  };
  await persist();

  if (failure) {
    const err = failure as Error;
    if (err instanceof Anthropic.APIError || err?.name === "AbortError") {
      emit({
        type: "error",
        code: "upstream",
        message: produced ? "The storyteller stopped partway. What was said is saved." : "The storyteller is unavailable right now. You weren't charged.",
      });
      console.error("[storyteller] API error", err instanceof Anthropic.APIError ? err.status : "", err.message);
    } else {
      throw failure;
    }
  }

  emit({ type: "done", balanceMicros: await stores.wallet.balance(ownerId), turnCostMicros: charge });
}
