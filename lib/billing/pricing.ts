/**
 * What a storyteller turn costs, from the token usage the API reports.
 * Client-safe (no server imports) so the UI can show estimates.
 *
 * Rates: USD per million tokens, from
 * https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-11-04).
 * When Anthropic changes prices, update this table; past charges keep the
 * price they were billed at (each ledger entry stores its cost breakdown).
 */

/** Our margin on top of the provider cost. 0.30 = cost + 30%. */
export const MARKUP = 0.3;

/** All money is stored as integer micro-dollars (1 USD = 1,000,000). */
export const MICROS_PER_USD = 1_000_000;

interface Rate {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

const rate = (input: number, cacheWrite5m: number, cacheWrite1h: number, cacheRead: number, output: number): Rate => ({
  input,
  cacheWrite5m,
  cacheWrite1h,
  cacheRead,
  output,
});

/** Models we offer, plus models the API may fall back to after a refusal. */
const RATES: Record<string, Rate> = {
  "claude-opus-5-5": rate(4, 5, 8, 0.2, 20),
  "claude-sonnet-5-5": rate(2, 2.5, 4, 0.1, 10),
  "claude-haiku-5-5": rate(0.1, 0.125, 0.2, 0.01, 0.5),
  "claude-opus-5": rate(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-8": rate(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-7": rate(5, 6.25, 10, 0.5, 25),
  "claude-sonnet-5": rate(2, 2.5, 4, 0.2, 10),
  "claude-sonnet-4-6": rate(3, 3.75, 6, 0.3, 15),
};
/** Haiku 5.5 when a request's prompt (input + cache reads + cache writes) is over 100K tokens. */
const HAIKU_LONG = rate(0.5, 0.625, 1, 0.05, 2.5);
const HAIKU_LONG_THRESHOLD = 100_000;
/** Unknown model ids (e.g. a new fallback target) are priced at this, and logged. */
const UNKNOWN = RATES["claude-opus-4-8"];
/** US-only inference (`inference_geo: "us"`) costs 1.1x. We don't request it, but price it if reported. */
const US_GEO_MULTIPLIER = 1.1;

/** The usage fields we read. Matches the API's `usage` object (and its `iterations`). */
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number } | null;
  inference_geo?: string | null;
  iterations?: Array<{
    type: string;
    model?: string | null;
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number } | null;
  }> | null;
}

export interface CostLine {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  micros: number; // provider cost, fractional
  unknownModel?: boolean;
}

type Tokens = Omit<UsageLike, "iterations" | "inference_geo">;

function priceTokens(model: string, t: Tokens, geoMultiplier: number): CostLine {
  const read = t.cache_read_input_tokens ?? 0;
  const writeTotal = t.cache_creation_input_tokens ?? 0;
  const write1h = t.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const write5m = t.cache_creation ? t.cache_creation.ephemeral_5m_input_tokens : writeTotal;
  const promptTokens = t.input_tokens + read + writeTotal;
  let r = RATES[model];
  const unknownModel = !r;
  if (!r) r = UNKNOWN;
  if (model === "claude-haiku-5-5" && promptTokens > HAIKU_LONG_THRESHOLD) r = HAIKU_LONG;
  // $/MTok × tokens = micro-dollars.
  const micros =
    (t.input_tokens * r.input + write5m * r.cacheWrite5m + write1h * r.cacheWrite1h + read * r.cacheRead + t.output_tokens * r.output) *
    geoMultiplier;
  return {
    model,
    inputTokens: t.input_tokens,
    outputTokens: t.output_tokens,
    cacheReadTokens: read,
    cacheWriteTokens: writeTotal,
    micros,
    ...(unknownModel ? { unknownModel } : {}),
  };
}

/**
 * Provider cost of one API response. When the response carries per-model
 * `iterations` (e.g. a refusal fallback ran part of it on another model),
 * each is priced at its own model's rates.
 */
export function responseCost(requestedModel: string, usage: UsageLike): CostLine[] {
  const geo = usage.inference_geo === "us" ? US_GEO_MULTIPLIER : 1;
  const its = usage.iterations?.filter((i) => i.type === "message" || i.type === "fallback_message" || i.type === "advisor_message" || i.type === "compaction");
  if (its && its.length) return its.map((i) => priceTokens(i.model ?? requestedModel, i, geo));
  return [priceTokens(requestedModel, usage, geo)];
}

/** What the player pays for a provider cost: cost + markup, rounded up to a whole micro-dollar. */
export function withMarkup(providerMicros: number): number {
  return providerMicros > 0 ? Math.ceil(providerMicros * (1 + MARKUP)) : 0;
}

/**
 * Amount reserved before a turn starts, so a turn can't run on an empty
 * balance. Assumes the worst plausible case: four model calls, each
 * re-writing the whole prompt to cache and writing 2,000 output tokens.
 * Anything not used is released when the turn settles.
 */
export function holdMicros(apiModel: string, promptTokens: number): number {
  const r = RATES[apiModel] ?? UNKNOWN;
  const perCall = promptTokens * r.cacheWrite5m + 2000 * r.output;
  return Math.max(10_000, withMarkup(4 * perCall));
}

/** A rough price per typical turn, for showing players before they choose. */
export function typicalTurnMicros(apiModel: string): number {
  // Two calls per turn; each ~16K-token prompt, mostly cached, ~600 output tokens.
  const call = { input_tokens: 1_000, cache_read_input_tokens: 13_500, cache_creation_input_tokens: 1_500, output_tokens: 600 };
  return withMarkup(2 * priceTokens(apiModel, call, 1).micros);
}

/** Rough token count of a prompt from its JSON size (~3.5 characters per token). */
export function estimateTokens(json: string): number {
  return Math.ceil(json.length / 3.5);
}
