import { describe, expect, it } from "vitest";
import { applyEvents, newSave } from "@/lib/save/reducer";
import { castVoice } from "@/lib/storyteller/casting";
import { checkOutcome, parseNotation, roll } from "@/lib/storyteller/dice";
import { buildSystemPrompt, sessionOpening } from "@/lib/storyteller/prompt";
import { NARRATOR, parseSay, SayParser } from "@/lib/storyteller/sayParser";
import { getStoryteller, STORYTELLERS } from "@/lib/storyteller/storytellers";
import { runTool, TOOL_NAMES, TOOL_PARAMS } from "@/lib/storyteller/tools";
import { transcriptFromMessages } from "@/lib/storyteller/transcript";

const NOW = "2026-11-04T12:00:00.000Z";
const seq = (...faces: number[]) => {
  let i = 0;
  return () => faces[i++ % faces.length];
};

describe("dice", () => {
  it("parses notation", () => {
    expect(parseNotation("d20+5")).toEqual({ count: 1, sides: 20, modifier: 5 });
    expect(parseNotation(" 2d6 - 1 ")).toEqual({ count: 2, sides: 6, modifier: -1 });
    expect(() => parseNotation("d1")).toThrow();
    expect(() => parseNotation("50d6")).toThrow();
    expect(() => parseNotation("fireball")).toThrow();
  });

  it("keeps the right die for advantage and disadvantage", () => {
    expect(roll("d20+2", "advantage", seq(4, 17))).toMatchObject({ rolls: [4, 17], kept: [17], total: 19, natural: 17 });
    expect(roll("d20+2", "disadvantage", seq(4, 17))).toMatchObject({ kept: [4], total: 6 });
    expect(roll("2d6+3", "advantage", seq(2, 5))).toMatchObject({ advantage: "none", rolls: [2, 5], total: 10 });
  });

  it("treats natural 20 and 1 as automatic success and failure", () => {
    expect(checkOutcome(roll("d20-5", "none", seq(20)), 25)).toBe("success");
    expect(checkOutcome(roll("d20+15", "none", seq(1)), 5)).toBe("failure");
    expect(checkOutcome(roll("d20+5", "none", seq(9)), 14)).toBe("success");
    expect(checkOutcome(roll("d20+5", "none", seq(8)), 14)).toBe("failure");
  });

  it("uses only valid faces with the default RNG", () => {
    for (let i = 0; i < 200; i++) {
      const r = roll("d6");
      expect(r.total).toBeGreaterThanOrEqual(1);
      expect(r.total).toBeLessThanOrEqual(6);
    }
  });
});

describe("say parser", () => {
  const text = 'Rain falls. <say who="venn" mood="wary">Port\'s closed.</say> He waits.';

  it("splits narration and dialogue", () => {
    expect(parseSay(text)).toEqual([
      { speaker: NARRATOR, text: "Rain falls. " },
      { speaker: "venn", mood: "wary", text: "Port's closed." },
      { speaker: NARRATOR, text: " He waits." },
    ]);
  });

  it("gives the same result however the stream is chunked", () => {
    for (let size = 1; size <= 7; size++) {
      const p = new SayParser();
      const out = [];
      for (let i = 0; i < text.length; i += size) out.push(...p.push(text.slice(i, i + size)));
      out.push(...p.flush());
      const merged = parseSay(out.map((x) => (x.speaker === NARRATOR ? x.text : `<say who="${x.speaker}" mood="${x.mood}">${x.text}</say>`)).join(""));
      expect(merged).toEqual(parseSay(text));
    }
  });

  it("passes through a lone '<' and unknown tags", () => {
    expect(parseSay("3 < 5 and <b>bold</b>")).toEqual([{ speaker: NARRATOR, text: "3 < 5 and <b>bold</b>" }]);
  });

  it("flushes an unclosed tag as text at the end", () => {
    expect(parseSay("Hello <sa")).toEqual([{ speaker: NARRATOR, text: "Hello <sa" }]);
  });
});

describe("casting", () => {
  it("matches a description to library tags", () => {
    const r = castVoice({ description: "an old sailor, gruff and suspicious", language: "en", usedVoiceIds: [] });
    expect(r).toMatchObject({ voiceId: "gravel-baritone", generated: false });
  });

  it("avoids voices already in use and reserved narration voices", () => {
    const r = castVoice({ description: "male older deep", language: "en", usedVoiceIds: ["weathered-bass"], reservedVoiceIds: ["ember-baritone"] });
    expect(["weathered-bass", "ember-baritone"]).not.toContain(r.voiceId);
  });

  it("requests a custom voice when nothing fits", () => {
    const r = castVoice({ description: "a choir of drowned whispers", language: "en", usedVoiceIds: [] });
    expect(r.generated).toBe(true);
    expect(r.voiceId).toMatch(/^gen-/);
  });
});

describe("tools", () => {
  const save = newSave({ campaignId: "c", ownerId: "u", title: "T", storytellerId: "eldrath", now: NOW });

  it("exposes every tool with eager streaming and an object schema", () => {
    expect(TOOL_PARAMS.map((t) => t.name)).toEqual(TOOL_NAMES);
    for (const t of TOOL_PARAMS) {
      expect(t.eager_input_streaming).toBe(true);
      expect(t.input_schema.type).toBe("object");
    }
  });

  it("rejects invalid input without throwing", () => {
    expect(runTool("offer_choices", { choices: ["only one"] }, { save, now: NOW })).toMatchObject({ isError: true, events: [] });
    expect(runTool("not_a_tool", {}, { save, now: NOW }).isError).toBe(true);
  });

  it("creates an npc and casts a voice in one batch", () => {
    const a = runTool("update_npc", { name: "Harbormaster Venn", disposition: "neutral" }, { save, now: NOW });
    expect(a.result).toContain("harbormaster-venn");
    const s1 = applyEvents(save, a.events, NOW);
    const b = runTool("cast_voice", { npc_id: "harbormaster-venn", description: "old sailor, gruff" }, { save: s1, now: NOW });
    const s2 = applyEvents(s1, b.events, NOW);
    expect(s2.npcs[0].voiceId).toBe("gravel-baritone");
    expect(b.ui[0]).toMatchObject({ type: "cast", npcId: "harbormaster-venn" });
  });

  it("rolls on the server and records the check", () => {
    const out = runTool("roll_dice", { notation: "d20+4", label: "Goblin attack", dc: 13 }, { save, now: NOW, rng: seq(10) });
    expect(out.result).toContain("= 14");
    expect(out.ui[0]).toMatchObject({ type: "dice", by: "storyteller", outcome: "success" });
    expect(out.events[0]).toMatchObject({ type: "mechanics.check" });
  });

  it("request_roll hands the turn back to the player", () => {
    const out = runTool("request_roll", { label: "Stealth", notation: "d20+5", dc: 14 }, { save, now: NOW });
    expect(out.yieldToPlayer).toBe(true);
    expect(out.ui[0]).toMatchObject({ type: "check", dc: 14 });
  });
});

describe("prompts", () => {
  it("keeps the system prompt identical across calls (cacheable)", () => {
    for (const st of STORYTELLERS) expect(buildSystemPrompt(st)).toBe(buildSystemPrompt(getStoryteller(st.id)));
  });

  it("asks for character creation on a brand-new campaign", () => {
    const save = newSave({ campaignId: "c", ownerId: "u", title: "T", storytellerId: "lyra", now: NOW });
    expect(sessionOpening(save, 1)).toContain("create a character");
    expect(sessionOpening(save, 1)).not.toContain('"ownerId"');
  });
});

describe("transcript", () => {
  it("rebuilds the visible feed and hides the opening and tool traffic", () => {
    const lines = transcriptFromMessages([
      { role: "user", content: [{ type: "text", text: "<save_file>{}</save_file>" }, { type: "text", text: "<player>Hello</player>" }] },
      { role: "assistant", content: [{ type: "thinking", thinking: "" }, { type: "text", text: 'Rain. <say who="venn" mood="wary">Closed.</say>' }, { type: "tool_use", id: "t", name: "x", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] },
      { role: "user", content: [{ type: "text", text: "[Dice] Stealth: 1d20+5 → [12] + 5 = 17" }] },
    ]);
    expect(lines).toEqual([
      { kind: "player", speaker: "player", text: "Hello" },
      { kind: "narration", speaker: NARRATOR, text: "Rain." },
      { kind: "npc", speaker: "venn", mood: "wary", text: "Closed." },
      { kind: "dice", speaker: "player", text: "Stealth: 1d20+5 → [12] + 5 = 17" },
    ]);
  });
});
