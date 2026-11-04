import type { Asset, SaveFile } from "@/lib/save/schema";
import type { DiceRoll } from "./dice";

/**
 * Events the server streams to the Story Table during a turn (one JSON
 * object per SSE `data:` line). Client-safe: types only.
 */
export type TableEvent =
  | { type: "turn.start"; sessionNo: number }
  | { type: "speech"; speaker: string; mood?: string; text: string }
  | { type: "speech.end" }
  | { type: "state"; save: SaveFile }
  | { type: "choices"; choices: string[] }
  | { type: "check"; label: string; notation: string; dc?: number }
  | { type: "dice"; by: "player" | "storyteller"; label: string; roll: DiceRoll; dc?: number; outcome?: "success" | "failure" }
  | { type: "image"; asset: Asset; status: "pending" | "unavailable" | "ready" }
  | { type: "handout"; asset: Asset }
  | { type: "ambience"; mood: string }
  | { type: "cast"; npcId: string; voiceId: string; label: string; generated: boolean }
  | { type: "notice"; message: string }
  | { type: "error"; code: "insufficient_funds" | "refused" | "upstream" | "invalid_input" | "not_found"; message: string }
  /** Balance after the turn settled, and what the turn cost the player (micro-dollars). */
  | { type: "done"; balanceMicros: number; turnCostMicros: number };

/** What the player can send for a turn. */
export type TurnInput =
  | { type: "begin" }
  | { type: "text"; text: string }
  | { type: "choice"; text: string }
  | { type: "roll"; notation: string; label: string; dc?: number; advantage?: "none" | "advantage" | "disadvantage" };

/** One line of the visible transcript, rebuilt from stored messages. */
export interface TranscriptLine {
  kind: "player" | "narration" | "npc" | "dice";
  speaker: string;
  mood?: string;
  text: string;
}
