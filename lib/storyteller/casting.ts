import { slugify } from "@/lib/save/reducer";
import { VOICES, type Voice } from "./voices";

export interface CastResult {
  voiceId: string;
  label: string;
  generated: boolean;
  score: number;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 2);

/** A match needs at least this many tag hits; below it a custom voice is requested. */
export const MIN_SCORE = 2;

/**
 * Pick the library voice whose tags best match a free-text description.
 * Voices already used by other characters in the campaign are penalized so
 * scenes stay easy to follow, and voices that don't speak the campaign's
 * language are skipped.
 */
export function castVoice(params: {
  description: string;
  language: string;
  usedVoiceIds: string[];
  reservedVoiceIds?: string[]; // e.g. the storyteller's narration voice
  library?: Voice[];
}): CastResult {
  const lib = params.library ?? VOICES;
  const want = new Set(words(params.description));
  const lang = params.language.slice(0, 2).toLowerCase();
  let best: { v: Voice; score: number } | null = null;

  for (const v of lib) {
    if (params.reservedVoiceIds?.includes(v.id)) continue;
    if (!v.languages.includes(lang)) continue;
    let score = 0;
    for (const t of v.tags) if (want.has(t)) score += 1;
    if (params.usedVoiceIds.includes(v.id)) score -= 1.5;
    if (!best || score > best.score) best = { v, score };
  }

  if (best && best.score >= MIN_SCORE) {
    return { voiceId: best.v.id, label: best.v.label, generated: false, score: best.score };
  }
  const desc = params.description.trim().slice(0, 120) || "custom voice";
  return { voiceId: `gen-${slugify(desc).slice(0, 40)}`, label: `Custom: ${desc}`, generated: true, score: best?.score ?? 0 };
}

/**
 * Pick a different library voice for a character the player wants recast.
 * Matches the character's description plus the player's hint (e.g. "older,
 * raspier, female"), never returns the current voice, and avoids voices other
 * characters already use. Always a library voice, so the change is immediate.
 */
export function recastVoice(params: {
  npc: { name: string; description: string };
  currentVoiceId?: string;
  hint?: string;
  language: string;
  usedVoiceIds: string[];
  reservedVoiceIds?: string[];
  library?: Voice[];
}): CastResult | null {
  const lib = params.library ?? VOICES;
  const lang = params.language.slice(0, 2).toLowerCase();
  const hintWords = new Set(words(params.hint ?? ""));
  const descWords = new Set(words(`${params.npc.name} ${params.npc.description}`));
  let best: { v: Voice; score: number } | null = null;
  for (const v of lib) {
    if (v.id === params.currentVoiceId || params.reservedVoiceIds?.includes(v.id) || !v.languages.includes(lang)) continue;
    let score = 0;
    // The player's hint counts double: it's what they asked for.
    for (const t of v.tags) score += (hintWords.has(t) ? 2 : 0) + (descWords.has(t) ? 1 : 0);
    if (params.usedVoiceIds.includes(v.id)) score -= 1.5;
    if (!best || score > best.score) best = { v, score };
  }
  return best ? { voiceId: best.v.id, label: best.v.label, generated: false, score: best.score } : null;
}
