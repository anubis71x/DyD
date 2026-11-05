import { describe, expect, it } from "vitest";
import { auditSpeakerTags, auditStyle, auditTurn } from "@/lib/playtest/audit";
import { applyEvents, newSave } from "@/lib/save/reducer";

const now = "2026-11-05T00:00:00.000Z";
const base = newSave({ campaignId: "c", ownerId: "u", title: "T", storytellerId: "eldrath", now });
const withVenn = applyEvents(
  base,
  [
    { type: "npc.upsert", id: "venn", name: "Venn" },
    { type: "npc.voice", npcId: "venn", voiceId: "gravel-bass" },
  ],
  now,
);
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("playtest audit", () => {
  it("accepts clean, tagged dialogue from a cast character", () => {
    expect(withVenn.npcs.map((n) => n.id)).toContain("venn");
    expect(auditSpeakerTags('Rain falls. <say who="venn" mood="wary">Port\'s closed.</say> He waits.', withVenn)).toEqual([]);
  });

  it("flags unknown speakers, untagged dialogue, nesting, imbalance and stray tags", () => {
    expect(codes(auditSpeakerTags('<say who="ghost">Boo.</say>', withVenn))).toContain("say.unknown_speaker");
    expect(codes(auditSpeakerTags('Venn says, "Port is closed tonight."', withVenn))).toContain("say.untagged_dialogue");
    expect(codes(auditSpeakerTags('<say who="venn">a <say who="venn">b</say></say>', withVenn))).toContain("say.nested");
    expect(codes(auditSpeakerTags('<say who="venn">open', withVenn))).toContain("say.unbalanced");
    expect(codes(auditSpeakerTags("<npc>hi</npc>", withVenn))).toContain("tag.unexpected");
    expect(codes(auditSpeakerTags('<say who="player">I agree.</say>', withVenn))).toContain("say.player_voiced");
  });

  it("flags markdown, long replies and invented rolls", () => {
    expect(codes(auditStyle("**Bold** move."))).toContain("style.markdown");
    const words = (n: number) => "word ".repeat(n).trim() + ".";
    expect(codes(auditStyle(words(170)))).toContain("style.long");
    expect(codes(auditStyle(words(170), "rich"))).not.toContain("style.long");
    expect(codes(auditStyle(words(90), "brief"))).toContain("style.long");
    expect(codes(auditStyle("You rolled a 17 and the lock clicks."))).toContain("dice.invented");
    expect(auditStyle("The door creaks open. Cold air.")).toEqual([]);
  });

  it("checks tool use across a turn", () => {
    const calls = [
      {
        stopReason: "tool_use",
        content: [
          { type: "tool_use", name: "request_roll", input: { label: "x", notation: "d20" } },
          { type: "text", text: "And then the guard notices you." },
          { type: "tool_use", name: "cast_voice", input: { npc_id: "nobody" } },
        ],
      },
    ];
    const f = codes(auditTurn(calls, base, withVenn, ["Invalid input for update_npc: name Required"]));
    expect(f).toEqual(expect.arrayContaining(["roll.kept_talking", "cast.unknown_npc", "tool.error"]));
  });
});

describe("tool fixes from playtests", async () => {
  const { runTool } = await import("@/lib/storyteller/tools");
  it("update_npc updates a known character by id without a name", () => {
    const out = runTool("update_npc", { id: "venn", last_interaction: "Took the bribe" }, { save: withVenn, now });
    expect(out.isError).toBe(false);
    expect(out.events[0]).toMatchObject({ type: "npc.upsert", id: "venn", lastInteraction: "Took the bribe" });
    expect(out.events[0]).not.toHaveProperty("name");
  });
  it("update_npc still needs a name for a new character", () => {
    expect(runTool("update_npc", {}, { save: withVenn, now }).isError).toBe(true);
    expect(runTool("update_npc", { id: "stranger" }, { save: withVenn, now }).events).toEqual([]);
  });
  it("update_npc gives a new character a voice, and leaves an existing voice alone", () => {
    const out = runTool("update_npc", { name: "Madame Corvane", voice: "older woman, silky, menacing" }, { save: base, now });
    expect(out.events.map((e) => e.type)).toEqual(expect.arrayContaining(["npc.upsert", "npc.voice"]));
    expect(out.ui[0]).toMatchObject({ type: "cast", npcId: "madame-corvane" });
    const again = runTool("update_npc", { id: "venn", disposition: "hostile" }, { save: withVenn, now });
    expect(again.events.map((e) => e.type)).toEqual(["npc.upsert"]);
  });
  it("set_ambience clips a long mood instead of failing", () => {
    const out = runTool("set_ambience", { mood: "tense dark docks at night with creaking ropes, gulls and distant bells" }, { save: base, now });
    expect(out.isError).toBe(false);
    expect((out.ui[0] as { mood: string }).mood.length).toBeLessThanOrEqual(60);
  });
  it("flags narration repeated across calls in one turn", () => {
    const t = "Berth Nine is empty, and a cut rope trails in the water.";
    const calls = [
      { stopReason: "tool_use", content: [{ type: "text", text: `The tide turned. ${t}` }] },
      { stopReason: "end_turn", content: [{ type: "text", text: `${t} What do you do?` }] },
    ];
    expect(codes(auditTurn(calls, base, base, []))).toContain("reply.repeated");
  });
});
