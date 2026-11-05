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
import type { PendingCheck, PlaySession, SessionUsage, Stores } from "@/lib/save/store";
import { checkOutcome, describeRoll, DiceError, parseNotation, roll } from "./dice";
import type { TableEvent, TurnInput } from "./events";
import { getModel, type StorytellerModel } from "./models";
import { buildSystemPrompt, sessionOpening } from "./prompt";
import { hasStory, RECAP_MODEL, sessionLines, summarizeSession } from "./recap";
import { SayParser } from "./sayParser";
import { getStoryteller } from "./storytellers";
import { feedbackBlock } from "./feedback";
import { sanitizePlayerText } from "./sanitize";
import { runTool, TOOL_PARAMS } from "./tools";
import { transcriptFromMessages } from "./transcript";

export const ENGINE_CONFIG = {
  maxTokens: 16000,
  maxToolRounds: 8,
  /** A session idle this long is closed with a journal recap; the next turn starts a new session. */
  sessionIdleMs: 6 * 60 * 60 * 1000,
  /**
   * When a part's prompt passes this many tokens, it is compacted: summarized
   * and continued in a fresh part of the same session. Keeps turns fast and
   * every prompt well under Haiku 5.5's 100K-token price step.
   */
  compactAtTokens: 60_000,
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
type SessionDeps = Pick<TurnDeps, "stores" | "client" | "emit">;

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
const sumMicros = (lines: CostLine[]) => lines.reduce((sum, l) => sum + l.micros, 0);

/** Charge a summary call (recap or compaction) at cost + markup. Idempotent on refId. */
async function chargeSummary(stores: Stores, ownerId: string, refId: string, costLines: CostLine[], meta: Record<string, unknown>) {
  const providerMicros = sumMicros(costLines);
  const charge = withMarkup(providerMicros);
  if (charge > 0) {
    await stores.wallet.post({
      refId,
      userId: ownerId,
      amountMicros: -charge,
      kind: "charge",
      meta: { ...meta, model: RECAP_MODEL, providerMicros, markup: MARKUP, lines: costLines },
    });
  }
}

/* ------------------------------------------------------------ sessions */

/**
 * End a session: write its journal recap (covering every part) to the save
 * file and mark it ended. A failed recap doesn't block anything; the session
 * still ends.
 */
export async function closeSession(ownerId: string, campaignId: string, session: PlaySession, deps: SessionDeps): Promise<void> {
  const { stores, emit } = deps;
  const now = new Date().toISOString();
  const lines = sessionLines(session);
  if (!session.recappedAt && hasStory(lines)) {
    try {
      const save = await loadCampaign(stores, ownerId, campaignId);
      const { event, costLines } = await summarizeSession(deps.client, save, session.sessionNo, lines, now, {
        scope: "session",
        ...(session.carry ? { earlierSummary: session.carry.summary } : {}),
      });
      await chargeSummary(stores, ownerId, `recap:${session.sessionId}`, costLines, { campaignId, sessionId: session.sessionId, purpose: "recap" });
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
export async function endSession(ownerId: string, campaignId: string, deps: SessionDeps): Promise<boolean> {
  const latest = await deps.stores.sessions.latest(ownerId, campaignId);
  if (!latest || latest.endedAt) return false;
  await closeSession(ownerId, campaignId, latest, deps);
  return true;
}

/** Prompt size of the current part: the API's own number when we have it. */
function promptTokens(session: PlaySession): number {
  return session.lastPromptTokens ?? estimateTokens(JSON.stringify(session.messages));
}

export function needsCompaction(session: PlaySession): boolean {
  return session.messages.length > 0 && promptTokens(session) > ENGINE_CONFIG.compactAtTokens;
}

/**
 * Compact a long session: summarize the current part, move its visible lines
 * to `earlierLines`, and start a fresh part whose opening carries the summary.
 * The session (and its number) continues. Returns false if the summary
 * failed; the history is then left as is and compaction is retried later.
 */
export async function compactSession(ownerId: string, campaignId: string, session: PlaySession, deps: SessionDeps): Promise<boolean> {
  const { stores } = deps;
  const partNo = session.partNo ?? 1;
  const partLines = transcriptFromMessages(session.messages);
  try {
    const save = await loadCampaign(stores, ownerId, campaignId);
    const { carry, costLines } = await summarizeSession(deps.client, save, session.sessionNo, partLines, new Date().toISOString(), {
      scope: "part",
      ...(session.carry ? { earlierSummary: session.carry.summary } : {}),
    });
    await chargeSummary(stores, ownerId, `compact:${session.sessionId}:${partNo}`, costLines, {
      campaignId,
      sessionId: session.sessionId,
      purpose: "compaction",
    });
    if (!carry) return false;
    const patch = {
      messages: [],
      partNo: partNo + 1,
      earlierLines: [...(session.earlierLines ?? []), ...partLines],
      carry,
      lastPromptTokens: 0,
    };
    await stores.sessions.update(ownerId, session.sessionId, patch);
    Object.assign(session, patch);
    return true;
  } catch (err) {
    console.error("[compaction] failed", err instanceof Anthropic.APIError ? err.status : "", (err as Error).message);
    return false;
  }
}

async function getOrStartSession(ownerId: string, campaignId: string, now: Date, deps: TurnDeps) {
  const { stores } = deps;
  const latest = await stores.sessions.latest(ownerId, campaignId);
  if (latest && !latest.endedAt) {
    const idle = now.getTime() - new Date(latest.lastActiveAt).getTime() >= ENGINE_CONFIG.sessionIdleMs;
    if (!idle) {
      // Normally compaction already ran after the previous turn; this catches a retry.
      if (needsCompaction(latest)) await compactSession(ownerId, campaignId, latest, deps);
      return latest;
    }
    await closeSession(ownerId, campaignId, latest, deps);
  }
  const session: PlaySession = {
    sessionId: randomUUID(),
    campaignId,
    ownerId,
    sessionNo: (await stores.sessions.count(ownerId, campaignId)) + 1,
    messages: [],
    partNo: 1,
    startedAt: now.toISOString(),
    lastActiveAt: now.toISOString(),
  };
  await stores.sessions.create(session);
  return session;
}

/* ---------------------------------------------------------------- turns */

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

export { sanitizePlayerText } from "./sanitize";

/**
 * Turn the player's input into message text, rolling dice server-side. A roll
 * answering the storyteller's check uses the server's record of that check
 * (dice, DC, advantage); anything else is labeled a free roll.
 */
function playerContent(input: TurnInput, pending: PendingCheck | null | undefined, deps: TurnDeps): string | null {
  switch (input.type) {
    case "begin":
      return null;
    case "text":
      return `<player>${sanitizePlayerText(input.text, 2000)}</player>`;
    case "choice":
      return `<player>${sanitizePlayerText(input.text, 200)}</player>`;
    case "roll": {
      if (pending) {
        const r = roll(pending.notation, pending.advantage ?? "none", deps.rng);
        const outcome = checkOutcome(r, pending.dc);
        deps.emit({ type: "dice", by: "player", label: pending.label, roll: r, ...(pending.dc !== undefined ? { dc: pending.dc } : {}), ...(outcome ? { outcome } : {}) });
        return `[Dice] ${describeRoll(r, pending.label, pending.dc)}`;
      }
      const label = "Free roll";
      const r = roll(input.notation, input.advantage ?? "none", deps.rng);
      deps.emit({ type: "dice", by: "player", label, roll: r });
      return `[Dice] ${describeRoll(r, label)} (the player rolled on their own; this is not a check you asked for)`;
    }
  }
}

/** Text that streamed before a failure, without a dangling half-written tag. */
function interruptedText(streamed: string): string | null {
  const text = streamed.replace(/<[^>]*$/, "").trimEnd();
  return text ? `${text}\n\n[The storyteller was interrupted here.]` : null;
}

/**
 * Run one player turn: append the player's input, then loop model → tools
 * until the storyteller hands the scene back. Every message is stored as
 * soon as it exists and exactly as received, so the history stays
 * append-only (thinking blocks are only valid in an unedited conversation)
 * and nothing is lost if the server dies mid-turn.
 *
 * Billing: before the turn, a worst-case amount is held from the player's
 * balance. Each completed model call is charged as it finishes (cost +
 * MARKUP), and the hold is released at the end.
 *
 * If the turn leaves the history long, it is compacted afterwards, after
 * the "done" event, so the player isn't kept waiting.
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

  const session = await getOrStartSession(ownerId, campaignId, new Date(), deps);
  const messages = asMessages(session.messages);
  if (messages.length > 0 && input.type === "begin") {
    // "begin" on a part already under way: nothing to send.
    emit({ type: "done", balanceMicros: await stores.wallet.balance(ownerId), turnCostMicros: 0 });
    return;
  }
  save = await loadCampaign(stores, ownerId, campaignId); // may include a recap written just now
  const opening = messages.length === 0 ? sessionOpening(save, session.sessionNo, session.carry ? { carry: session.carry } : {}) : "";

  // Hold enough for a long turn before anything is sent or rolled.
  const turnId = randomUUID();
  const estPrompt = (session.lastPromptTokens || estimateTokens(systemPrompt + JSON.stringify(TOOL_PARAMS) + JSON.stringify(messages))) + estimateTokens(opening) + 600;
  const hold = holdMicros(model.apiModel, estPrompt);
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

  const usage = { ...(session.usage ?? {}) };
  const persist = () =>
    stores.sessions.update(ownerId, session.sessionId, {
      messages,
      usage,
      ...(session.lastPromptTokens !== undefined ? { lastPromptTokens: session.lastPromptTokens } : {}),
      pendingCheck: session.pendingCheck ?? null,
      lastActiveAt: new Date().toISOString(),
    });

  // The player's input is saved before the model is called.
  const content: BetaContentBlockParam[] = [];
  if (opening) content.push({ type: "text", text: opening });
  // Feedback the player gave since the last turn (it never interrupts a turn; it waits for this one).
  const feedback = await stores.feedback.pending(ownerId, campaignId);
  if (feedback.length) content.push({ type: "text", text: feedbackBlock(feedback, save) });
  const playerText = playerContent(input, session.pendingCheck, deps);
  // A roll answers the pending check; typing or choosing something else moves on from it.
  if (input.type !== "begin") session.pendingCheck = null;
  if (playerText) content.push({ type: "text", text: playerText });
  const userMessage: BetaMessageParam = { role: "user", content };
  messages.push(userMessage);
  await persist();
  emit({ type: "turn.start", sessionNo: session.sessionNo });

  let charged = 0;
  let calls = 0;
  let produced = false;
  /** Whether the player has heard any narration this turn (across all rounds). */
  let narrated = false;
  let failure: unknown = null;
  try {
    for (let round = 0; round < ENGINE_CONFIG.maxToolRounds; round++) {
      const parser = new SayParser();
      let streamed = "";
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
        streamed += delta;
        if (delta.trim()) narrated = true;
        forward(parser.push(delta));
      });

      let message: BetaMessage;
      try {
        message = await stream.finalMessage();
      } catch (err) {
        // A tool input that could not be parsed at all: re-issue the round once.
        if (!(err instanceof Anthropic.APIError) && round === 0 && !produced) continue;
        // Keep what the player already saw, marked as interrupted.
        const partial = interruptedText(streamed);
        if (partial) {
          forward(parser.flush());
          emit({ type: "speech.end" });
          messages.push({ role: "assistant", content: [{ type: "text", text: partial }] });
        }
        throw err;
      }
      forward(parser.flush());
      emit({ type: "speech.end" });

      // Charge this call now, so a crash later in the turn can't lose it.
      calls++;
      const costLines = responseCost(model.apiModel, message.usage);
      const callCharge = withMarkup(sumMicros(costLines));
      if (callCharge > 0) {
        await stores.wallet.post({
          refId: `turn:${turnId}:charge:${round}`,
          userId: ownerId,
          amountMicros: -callCharge,
          kind: "charge",
          meta: { campaignId, sessionId: session.sessionId, model: model.apiModel, providerMicros: sumMicros(costLines), markup: MARKUP, lines: costLines },
        });
        charged += callCharge;
      }
      const u = usage[model.id] ?? EMPTY_USAGE;
      usage[model.id] = {
        ...u,
        calls: u.calls + 1,
        inputTokens: u.inputTokens + message.usage.input_tokens,
        outputTokens: u.outputTokens + message.usage.output_tokens,
        cacheReadTokens: u.cacheReadTokens + (message.usage.cache_read_input_tokens ?? 0),
        cacheWriteTokens: u.cacheWriteTokens + (message.usage.cache_creation_input_tokens ?? 0),
        providerMicros: u.providerMicros + sumMicros(costLines),
        chargedMicros: u.chargedMicros + callCharge,
      };
      session.lastPromptTokens =
        message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
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
        for (const e of out.ui) {
          if (e.type === "check") {
            session.pendingCheck = { label: e.label, notation: e.notation, ...(e.dc !== undefined ? { dc: e.dc } : {}), ...(e.advantage ? { advantage: e.advantage } : {}) };
          }
        }
        yieldToPlayer ||= !!out.yieldToPlayer;
        let result = out.result;
        // Choices close a turn. Once the player has heard the narration, another model
        // call only repeats it (Haiku in playtests) or adds nothing, so end the turn here.
        if (call.name === "offer_choices" && !out.isError) {
          if (narrated) yieldToPlayer = true;
          else result += " The player hasn't heard anything yet this turn. Write your full reply now: respond to what the player did and set the scene in two to five sentences (open with the brief 'previously' if this is the start of a session). Don't list the choices.";
        }
        results.push({ type: "tool_result", tool_use_id: call.id, content: result, ...(out.isError ? { is_error: true } : {}) });
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
    // Nothing came back at all: drop typed input so the player can resend it
    // as is. A dice roll stays: it was really rolled.
    if (!produced && input.type !== "roll" && messages[messages.length - 1]?.role === "user") messages.pop();
  }

  // Feedback counts as delivered only if the message carrying it stayed in the history.
  if (feedback.length && messages.includes(userMessage)) {
    await stores.feedback.markDelivered(feedback.map((f) => f.id), new Date().toISOString());
  }
  await stores.wallet.post({ refId: `turn:${turnId}:release`, userId: ownerId, amountMicros: hold, kind: "release", meta: { campaignId } });
  if (calls) {
    const u = usage[model.id] ?? EMPTY_USAGE;
    usage[model.id] = { ...u, turns: u.turns + 1 };
  }
  await persist();

  if (failure) {
    const err = failure as Error;
    if (err instanceof Anthropic.APIError || err?.name === "AbortError") {
      emit({
        type: "error",
        code: "upstream",
        message: produced ? "The storyteller was interrupted. What was said is saved." : "The storyteller is unavailable right now. You weren't charged.",
      });
      console.error("[storyteller] API error", err instanceof Anthropic.APIError ? err.status : "", err.message);
    } else {
      throw failure;
    }
  }

  emit({ type: "done", balanceMicros: await stores.wallet.balance(ownerId), turnCostMicros: charged });

  // The player has the reply; condense the history now if it got long.
  if (!failure && needsCompaction(session)) await compactSession(ownerId, campaignId, session, deps);
}
