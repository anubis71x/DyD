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
