import { describe, expect, it } from "vitest";
import { applyEvents, newSave } from "@/lib/save/reducer";
import { pickSystemVoice, speechProfile } from "@/lib/voice/browserSpeech";
import { resolveVoice } from "@/lib/voice/routing";
import { cleanForSpeech, UtteranceSegmenter } from "@/lib/voice/segmenter";

const NOW = "2026-11-05T12:00:00.000Z";

describe("utterance segmenter", () => {
  it("emits whole sentences as they complete, however the text streams in", () => {
    const text = "Rain needles the window of the office. Venn looks up from his ledger! What now? ";
    const seg = new UtteranceSegmenter();
    const out = [];
    for (const ch of text.match(/[\s\S]{1,3}/g)!) out.push(...seg.push("narrator", ch));
    out.push(...seg.flush());
    // Each sentence is spoken as soon as it's complete; a short last one is held until the end.
    expect(out.map((u) => u.text)).toEqual(["Rain needles the window of the office.", "Venn looks up from his ledger!", "What now?"]);
  });

  it("starts a new utterance when the speaker changes, and keeps the mood", () => {
    const seg = new UtteranceSegmenter();
    const out = [...seg.push("narrator", "He turns. "), ...seg.push("venn", "Port's closed", "wary"), ...seg.push("venn", " after dark.", "wary"), ...seg.flush()];
    expect(out).toEqual([
      { speaker: "narrator", text: "He turns." },
      { speaker: "venn", mood: "wary", text: "Port's closed after dark." },
    ]);
  });

  it("doesn't split after abbreviations or on tiny fragments", () => {
    const seg = new UtteranceSegmenter();
    const out = [...seg.push("narrator", "Hm. Mr. Venn meets Dr. Ash at the docks. Then silence. "), ...seg.flush()];
    expect(out.map((u) => u.text)).toEqual(["Hm. Mr. Venn meets Dr. Ash at the docks.", "Then silence."]);
  });

  it("drops stage notes and markdown before speaking", () => {
    expect(cleanForSpeech("The singing grows.\n\n[The storyteller was interrupted here.]")).toBe("The singing grows.");
    expect(cleanForSpeech("**Run!**")).toBe("Run!");
  });
});

describe("voice routing", () => {
  const save = applyEvents(newSave({ campaignId: "c", ownerId: "u", title: "T", storytellerId: "lyra", now: NOW }), [
    { type: "npc.upsert", id: "venn", name: "Venn" },
    { type: "npc.voice", npcId: "venn", voiceId: "gravel-baritone" },
    { type: "npc.upsert", id: "choir", name: "The Choir" },
    { type: "voice.generated", voiceId: "gen-choir", description: "layered whispering chorus, creepy", createdAt: NOW },
    { type: "npc.voice", npcId: "choir", voiceId: "gen-choir" },
    { type: "npc.upsert", id: "mirel", name: "Mirel" },
  ], NOW);

  it("uses the storyteller's voice for narration and uncast characters", () => {
    expect(resolveVoice("narrator", save).voiceId).toBe("silver-mezzo");
    expect(resolveVoice("mirel", save).voiceId).toBe("silver-mezzo");
  });

  it("uses cast voices, including custom ones described in words", () => {
    expect(resolveVoice("venn", save)).toMatchObject({ voiceId: "gravel-baritone", tags: expect.arrayContaining(["gruff"]) });
    expect(resolveVoice("choir", save)).toMatchObject({ voiceId: "gen-choir", tags: expect.arrayContaining(["creepy", "whispering"]) });
  });
});

describe("device voice profiles", () => {
  it("lowers deep voices, raises small ones, slows the old", () => {
    expect(speechProfile(["deep", "dragon", "ancient", "slow"])).toMatchObject({ pitch: 0.7, rate: 0.8 });
    expect(speechProfile(["child", "energetic"])).toMatchObject({ pitch: 1.45, rate: 1.1 });
    expect(speechProfile(["female", "young"]).gender).toBe("female");
    expect(speechProfile([])).toEqual({ pitch: 1, rate: 1 });
  });

  it("picks a stable system voice in the right language and gender", () => {
    const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;
    const voices = [v("Daniel", "en-GB"), v("Samantha", "en-US"), v("Google español", "es-ES"), v("Alex", "en-US")];
    expect(pickSystemVoice(voices, "x", "es")?.name).toBe("Google español");
    expect(["Daniel", "Alex"]).toContain(pickSystemVoice(voices, "gravel-baritone", "en", "male")?.name);
    expect(pickSystemVoice(voices, "silver-mezzo", "en", "female")?.name).toBe("Samantha");
    expect(pickSystemVoice(voices, "gravel-baritone", "en", "male")).toBe(pickSystemVoice(voices, "gravel-baritone", "en", "male"));
    expect(pickSystemVoice(voices, "a", "ja")).toBeDefined(); // falls back to any voice
  });
});
