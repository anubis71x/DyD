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
    expect(codes(auditStyle("One. ".repeat(12)))).toContain("style.long");
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
