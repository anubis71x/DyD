/**
 * Voice library the storyteller casts from. `providerVoiceId` is filled in
 * when TTS is wired up (Phase 2); casting works on tags alone until then, so
 * NPC voice assignments made now carry over unchanged.
 */

export interface Voice {
  id: string;
  label: string;
  provider: "elevenlabs" | "generated";
  providerVoiceId?: string;
  tags: string[];
  languages: string[];
}

export const VOICES: Voice[] = [
  { id: "ember-baritone", label: "Ember Baritone", provider: "elevenlabs", tags: ["male", "older", "deep", "warm", "narrator", "wise"], languages: ["en", "es"] },
  { id: "silver-mezzo", label: "Silver Mezzo", provider: "elevenlabs", tags: ["female", "young", "bright", "gentle", "narrator", "whimsical"], languages: ["en", "ja"] },
  { id: "warm-tenor", label: "Warm Tenor", provider: "elevenlabs", tags: ["male", "middle-aged", "friendly", "cheerful", "narrator", "comic"], languages: ["en"] },
  { id: "clipped-alto", label: "Clipped Alto", provider: "elevenlabs", tags: ["female", "middle-aged", "stern", "military", "narrator", "commanding"], languages: ["en", "es"] },
  { id: "gravel-baritone", label: "Gravel Baritone", provider: "elevenlabs", tags: ["male", "older", "gruff", "rough", "suspicious", "sailor", "working-class"], languages: ["en"] },
  { id: "weathered-bass", label: "Weathered Bass", provider: "elevenlabs", tags: ["male", "older", "deep", "slow", "giant", "ogre", "dwarf", "booming"], languages: ["en"] },
  { id: "smoky-contralto", label: "Smoky Contralto", provider: "elevenlabs", tags: ["female", "older", "low", "sly", "mysterious", "witch", "merchant"], languages: ["en", "es"] },
  { id: "reedy-tenor", label: "Reedy Tenor", provider: "elevenlabs", tags: ["male", "young", "thin", "nervous", "scholar", "clerk", "goblin"], languages: ["en"] },
  { id: "bright-youth", label: "Bright Youth", provider: "elevenlabs", tags: ["child", "young", "energetic", "cheerful", "apprentice"], languages: ["en", "es"] },
  { id: "velvet-soprano", label: "Velvet Soprano", provider: "elevenlabs", tags: ["female", "young", "elegant", "noble", "elf", "royal", "charming"], languages: ["en", "ja"] },
  { id: "iron-commander", label: "Iron Commander", provider: "elevenlabs", tags: ["male", "middle-aged", "commanding", "soldier", "knight", "loud", "heroic"], languages: ["en", "es"] },
  { id: "rasp-whisper", label: "Rasp Whisper", provider: "elevenlabs", tags: ["neutral", "older", "whisper", "creepy", "undead", "ghost", "villain"], languages: ["en"] },
  { id: "cavern-rumble", label: "Cavern Rumble", provider: "elevenlabs", tags: ["neutral", "ancient", "deep", "slow", "dragon", "monster", "huge", "booming"], languages: ["en"] },
  { id: "silk-schemer", label: "Silk Schemer", provider: "elevenlabs", tags: ["male", "middle-aged", "smooth", "sly", "villain", "noble", "manipulative"], languages: ["en", "es"] },
  { id: "hearth-grandmother", label: "Hearth Grandmother", provider: "elevenlabs", tags: ["female", "older", "kind", "warm", "innkeeper", "healer"], languages: ["en", "es", "ja"] },
  { id: "sprite-chime", label: "Sprite Chime", provider: "elevenlabs", tags: ["neutral", "tiny", "high", "fey", "fairy", "playful", "magical"], languages: ["en", "ja"] },
];

export const VOICE_BY_ID = new Map(VOICES.map((v) => [v.id, v]));

export function voiceLabel(id: string | undefined, generated: { voiceId: string; description: string }[] = []): string | undefined {
  if (!id) return undefined;
  const v = VOICE_BY_ID.get(id);
  if (v) return v.label;
  const g = generated.find((x) => x.voiceId === id);
  return g ? `Custom: ${g.description}` : undefined;
}
