import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createMemoryStores } from "@/lib/save/memoryStore";
import { createCampaign } from "@/lib/save/service";
import { runTurn } from "@/lib/storyteller/engine";
import type { TableEvent } from "@/lib/storyteller/events";

/**
 * A scripted stand-in for client.beta.messages.stream: each call returns the
 * next canned message, streaming its text blocks through "text" listeners.
 */
function fakeClient(script: Array<{ content: any[]; stop_reason: string }>) {
  const requests: any[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: any) {
          requests.push(structuredClone(params));
          const msg = script.shift();
          if (!msg) throw new Error("script exhausted");
          const listeners: Array<(d: string) => void> = [];
          return {
            on(evt: string, fn: (d: string) => void) {
              if (evt === "text") listeners.push(fn);
              return this;
            },
            async finalMessage() {
              for (const b of msg.content) if (b.type === "text") for (const ch of b.text.match(/[\s\S]{1,5}/g) ?? []) listeners.forEach((f) => f(ch));
              return { id: "m", type: "message", role: "assistant", model: "x", usage: {}, ...msg };
            },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, requests };
}

async function setup(coins = 5) {
  const mem = createMemoryStores({ u: coins });
  const campaign = await createCampaign(mem.stores, "u", { title: "T", storytellerId: "eldrath" });
  return { ...mem, campaign };
}

describe("runTurn", () => {
  it("runs tools, commits the save, streams speech and stores an append-only history", async () => {
    const { stores, campaign, _debug } = await setup();
    const { client, requests } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "thinking", thinking: "", signature: "sig" },
          { type: "text", text: "The door creaks." },
          { type: "tool_use", id: "t1", name: "update_npc", input: { name: "Harbormaster Venn" } },
          { type: "tool_use", id: "t2", name: "cast_voice", input: { npc_id: "harbormaster-venn", description: "old sailor, gruff" } },
          { type: "tool_use", id: "t3", name: "change_inventory", input: { add: [{ name: "Wet map" }] } },
        ],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: '<say who="harbormaster-venn" mood="wary">Port\'s closed.</say>' }] },
    ]);
    const events: TableEvent[] = [];
    await runTurn("u", campaign.campaignId, { type: "begin" }, { stores, client, emit: (e) => events.push(e) });

    const save = await stores.campaigns.get("u", campaign.campaignId);
    expect(save?.npcs[0]).toMatchObject({ id: "harbormaster-venn", voiceId: "gravel-baritone" });
    expect(save?.character.inventory).toEqual([{ name: "Wet map", qty: 1 }]);

    const speech = events.filter((e) => e.type === "speech") as Extract<TableEvent, { type: "speech" }>[];
    expect(speech.map((s) => s.speaker)).toContain("harbormaster-venn");
    expect(speech.filter((s) => s.speaker === "harbormaster-venn").map((s) => s.text).join("")).toBe("Port's closed.");
    expect(events.some((e) => e.type === "cast")).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done", coins: 4 });

    // Request shape: cached static system prompt, fallbacks on, history grows by appending.
    expect(requests[0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(requests[0].system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(requests[1].system).toEqual(requests[0].system);
    expect(requests[1].messages.slice(0, requests[0].messages.length)).toEqual(requests[0].messages);
    const toolResults = requests[1].messages.at(-1).content;
    expect(toolResults.map((r: any) => r.tool_use_id)).toEqual(["t1", "t2", "t3"]);
    expect(requests[1].messages.at(-2).content[0]).toEqual({ type: "thinking", thinking: "", signature: "sig" });

    const session = Array.from(_debug.sessions.values())[0];
    expect(session.messages).toHaveLength(4);
    expect((session.messages[0] as any).content[0].text).toContain("<save_file>");
  });

  it("refuses to play without coins and does not call the model", async () => {
    const { stores, campaign } = await setup(0);
    const { client, requests } = fakeClient([]);
    const events: TableEvent[] = [];
    await runTurn("u", campaign.campaignId, { type: "text", text: "hi" }, { stores, client, emit: (e) => events.push(e) });
    expect(events).toEqual([{ type: "error", code: "out_of_coins", message: expect.any(String) }]);
    expect(requests).toHaveLength(0);
  });

  it("ends the turn when the storyteller asks the player to roll, then resolves the roll next turn", async () => {
    const { stores, campaign } = await setup();
    const { client, requests } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "text", text: "Roll for it." }, { type: "tool_use", id: "r", name: "request_roll", input: { label: "Stealth", notation: "d20+5", dc: 14 } }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "You slip past." }] },
    ]);
    const events: TableEvent[] = [];
    const deps = { stores, client, emit: (e: TableEvent) => events.push(e), rng: () => 12 };
    await runTurn("u", campaign.campaignId, { type: "text", text: "I sneak past" }, deps);
    expect(requests).toHaveLength(1);
    expect(events.some((e) => e.type === "check")).toBe(true);

    await runTurn("u", campaign.campaignId, { type: "roll", notation: "d20+5", label: "Stealth", dc: 14 }, deps);
    const last = requests[1].messages.at(-1);
    expect(last.role).toBe("user");
    expect(last.content[0].text).toBe("[Dice] Stealth: 1d20+5 → [12] + 5 = 17 vs DC 14: success");
    expect(events.find((e) => e.type === "dice")).toMatchObject({ by: "player", outcome: "success" });
  });

  it("refunds the coin and keeps history valid when the API fails before any output", async () => {
    const { stores, campaign, _debug } = await setup(2);
    const { APIError } = await import("@anthropic-ai/sdk");
    const client = {
      beta: { messages: { stream() { return { on() { return this; }, async finalMessage() { throw new APIError(529, undefined, "overloaded", undefined); } }; } } },
    } as unknown as Anthropic;
    const events: TableEvent[] = [];
    await runTurn("u", campaign.campaignId, { type: "text", text: "hi" }, { stores, client, emit: (e) => events.push(e) });
    expect(events.at(-1)).toMatchObject({ type: "error", code: "upstream" });
    expect(_debug.coins.get("u")).toBe(2);
    expect(Array.from(_debug.sessions.values())[0].messages).toEqual([]);
  });
});
