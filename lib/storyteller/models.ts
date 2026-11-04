/**
 * Models a player can choose for their storyteller. Client-safe.
 *
 * `coinsPerTurn` is what a player pays for one storyteller turn on that
 * model. Rough API cost per text turn (two model calls of ~15K input tokens,
 * mostly cached, and ~600 output tokens each): Haiku ≈ $0.002,
 * Sonnet ≈ $0.03, Opus ≈ $0.06. The session usage log records real numbers
 * (see PlaySession.usage) so these prices can be tuned.
 */

export type ModelId = "haiku" | "sonnet" | "opus";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface StorytellerModel {
  id: ModelId;
  apiModel: string;
  name: string;
  tagline: string;
  coinsPerTurn: number;
  effort: Effort;
  /** Server-side refusal fallback (`fallbacks: "default"`). Not available on Haiku 5.5. */
  serverFallback: boolean;
}

export const MODELS: StorytellerModel[] = [
  {
    id: "haiku",
    apiModel: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    tagline: "Fastest replies. Great for everyday play.",
    coinsPerTurn: 1,
    // Haiku's default. Cheap enough that the extra care is worth it for bookkeeping.
    effort: "medium",
    serverFallback: false,
  },
  {
    id: "sonnet",
    apiModel: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    tagline: "Richer scenes and sharper characters.",
    coinsPerTurn: 2,
    effort: "low",
    serverFallback: true,
  },
  {
    id: "opus",
    apiModel: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    tagline: "The most thoughtful storyteller. Slower.",
    coinsPerTurn: 3,
    effort: "low",
    serverFallback: true,
  },
];

export const DEFAULT_MODEL_ID: ModelId = "haiku";
export const MODEL_IDS = MODELS.map((m) => m.id) as [ModelId, ...ModelId[]];

export function getModel(id: string | undefined): StorytellerModel {
  return MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL_ID)!;
}
