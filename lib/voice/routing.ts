import type { SaveFile } from "@/lib/save/schema";
import { NARRATOR } from "@/lib/storyteller/sayParser";
import { getStoryteller } from "@/lib/storyteller/storytellers";
import { VOICE_BY_ID, type Voice } from "@/lib/storyteller/voices";

export interface ResolvedVoice {
  /** Library voice id, or a generated id (`gen-…`) for custom voices. */
  voiceId: string;
  /** Tags describing the voice (from the library, or the custom voice's description). */
  tags: string[];
}

/**
 * Which voice says a line: the storyteller's narration voice for narration,
 * the cast voice for a character, and the narration voice for characters
 * not cast yet.
 */
export function resolveVoice(speaker: string, save: SaveFile): ResolvedVoice {
  const narration = getStoryteller(save.storytellerId).narrationVoiceId;
  const id = speaker === NARRATOR ? narration : save.npcs.find((n) => n.id === speaker)?.voiceId ?? narration;
  const lib: Voice | undefined = VOICE_BY_ID.get(id);
  if (lib) return { voiceId: id, tags: lib.tags };
  const generated = save.generatedVoices.find((g) => g.voiceId === id);
  return { voiceId: id, tags: generated ? generated.description.toLowerCase().split(/[^a-z-]+/).filter(Boolean) : [] };
}
