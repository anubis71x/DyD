import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { createMemoryStores } from "@/lib/save/memoryStore";
import { commitEvents, createCampaign } from "@/lib/save/service";
import { ENGINE_CONFIG, endSession, runTurn } from "@/lib/storyteller/engine";
import type { TableEvent } from "@/lib/storyteller/events";

/**
 * A scripted stand-in for client.beta.messages.stream: each call returns the
 * next canned message, streaming its text blocks through "text" listeners.
 */
const RECAP = {
  summary: "You talked your way into the harbor office.",
  notable_quotes: ["Venn: Port's closed."],
  next_session_hooks: ["Who pays the Tide Choir?"],
  story_so_far: "A thief in Port Halloway chases a stolen lantern.",
  left_off: "Venn is waiting for an answer.",
};

function fakeClient(
  script: Array<{ content: any[]; stop_reason: string }>,
  recap: { parsed: unknown; stop_reason?: string } = { parsed: RECAP },
) {
  const requests: any[] = [];
  const recapRequests: any[] = [];
  const client = {
    messages: {
      async parse(params: any) {
        recapRequests.push(params);
        return { stop_reason: recap.stop_reason ?? "end_turn", parsed_output: recap.parsed, usage: { input_tokens: 2000, output_tokens: 300 } };
      },
    },
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
              return { id: "m", type: "message", role: "assistant", model: "x", usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 }, ...msg };
            },
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, requests, recapRequests };
}

const USD = 1_000_000;

async function setup(balanceMicros = 5 * USD, modelId?: "haiku" | "sonnet" | "opus") {
  const mem = createMemoryStores({ u: balanceMicros });
  const campaign = await createCampaign(mem.stores, "u", { title: "T", storytellerId: "eldrath", ...(modelId ? { modelId } : {}) });
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
    // Two Haiku calls × (100 in × $0.10 + 900 cache reads × $0.01 + 20 out × $0.50) = 58 micro-dollars; +30% → 76.
    expect(events.at(-1)).toEqual({ type: "done", balanceMicros: 5 * USD - 76, turnCostMicros: 76 });
    const kinds = Array.from(_debug.ledger.values()).map((e) => [e.kind, e.amountMicros]);
    expect(kinds).toEqual([["hold", expect.any(Number)], ["release", -kinds[0][1]], ["charge", -76]]);

    // Request shape: cached static system prompt, fallbacks on, history grows by appending.
    // Default model is Haiku 5.5, which has no server-side fallback: no fallbacks/betas sent.
    expect(requests[0]).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "medium" } });
    expect(requests[0]).not.toHaveProperty("fallbacks");
    expect(requests[0]).not.toHaveProperty("betas");
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

  it("refuses to play without enough balance for the hold and does not call the model", async () => {
    const { stores, campaign } = await setup(0);
    const { client, requests } = fakeClient([]);
    const events: TableEvent[] = [];
    await runTurn("u", campaign.campaignId, { type: "text", text: "hi" }, { stores, client, emit: (e) => events.push(e) });
    expect(events).toEqual([{ type: "error", code: "insufficient_funds", message: expect.stringContaining("Add funds") }]);
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

  it("charges nothing and keeps history valid when the API fails before any output", async () => {
    const { stores, campaign, _debug } = await setup(2 * USD);
    const { APIError } = await import("@anthropic-ai/sdk");
    const client = {
      beta: { messages: { stream() { return { on() { return this; }, async finalMessage() { throw new APIError(529, undefined, "overloaded", undefined); } }; } } },
    } as unknown as Anthropic;
    const events: TableEvent[] = [];
    await runTurn("u", campaign.campaignId, { type: "text", text: "hi" }, { stores, client, emit: (e) => events.push(e) });
    expect(events.find((e) => e.type === "error")).toMatchObject({ code: "upstream", message: expect.stringContaining("weren't charged") });
    expect(events.at(-1)).toEqual({ type: "done", balanceMicros: 2 * USD, turnCostMicros: 0 });
    expect(_debug.balances.get("u")).toBe(2 * USD);
    expect(Array.from(_debug.ledger.values()).some((e) => e.kind === "charge")).toBe(false);
    expect(Array.from(_debug.sessions.values())[0].messages).toEqual([]);
  });

  it("uses the campaign's model, its coin price and refusal fallbacks where supported", async () => {
    const { stores, campaign, _debug } = await setup(5 * USD, "opus");
    const { client, requests } = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "Hello." }] }]);
    const events: TableEvent[] = [];
    await runTurn("u", campaign.campaignId, { type: "begin" }, { stores, client, emit: (e) => events.push(e) });
    expect(requests[0]).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    // 100 × $4 + 900 × $0.20 + 20 × $20 = 980 micro-dollars; +30% → 1274.
    expect(events.at(-1)).toEqual({ type: "done", balanceMicros: 5 * USD - 1274, turnCostMicros: 1274 });
    const session = Array.from(_debug.sessions.values())[0];
    expect(session.usage?.opus).toEqual({ turns: 1, calls: 1, inputTokens: 100, outputTokens: 20, cacheReadTokens: 900, cacheWriteTokens: 0, providerMicros: 980, chargedMicros: 1274 });
  });

  it("switching models mid-campaign takes effect on the next turn", async () => {
    const { stores, campaign } = await setup(10 * USD);
    const { client, requests } = fakeClient([
      { stop_reason: "end_turn", content: [{ type: "text", text: "One." }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Two." }] },
    ]);
    const deps = { stores, client, emit: () => {} };
    await runTurn("u", campaign.campaignId, { type: "begin" }, deps);
    await commitEvents(stores, "u", campaign.campaignId, [{ type: "campaign.model", modelId: "sonnet" }], "user");
    await runTurn("u", campaign.campaignId, { type: "text", text: "next" }, deps);
    expect(requests.map((r) => r.model)).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5"]);
    // Haiku 29 → 38, then Sonnet (100 × $2 + 900 × $0.10 + 20 × $10 = 490) → 637.
    expect(await stores.wallet.balance("u")).toBe(10 * USD - 38 - 637);
  });

  it("suggests a cheaper model when the balance can't cover this one", async () => {
    const { stores, campaign } = await setup(1000, "opus"); // $0.001
    const { client, requests } = fakeClient([]);
    const events: TableEvent[] = [];
    await runTurn("u", campaign.campaignId, { type: "begin" }, { stores, client, emit: (e) => events.push(e) });
    expect(requests).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: "error", code: "insufficient_funds", message: expect.stringContaining("switch to Claude Haiku 5.5") });
    expect(await stores.wallet.balance("u")).toBe(1000);
  });

});

const say = (text: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

describe("sessions and recaps", () => {
  it("closes an idle session with a recap and opens the next with a 'previously'", async () => {
    const { stores, campaign, _debug } = await setup();
    const { client, requests, recapRequests } = fakeClient([say("Welcome."), say("Previously…")]);
    const events: TableEvent[] = [];
    const deps = { stores, client, emit: (e: TableEvent) => events.push(e) };
    await runTurn("u", campaign.campaignId, { type: "begin" }, deps);

    // Seven hours later…
    const first = Array.from(_debug.sessions.values())[0];
    first.lastActiveAt = new Date(Date.now() - ENGINE_CONFIG.sessionIdleMs - 60_000).toISOString();
    await runTurn("u", campaign.campaignId, { type: "text", text: "I'm back" }, deps);

    expect(recapRequests).toHaveLength(1);
    expect(recapRequests[0].model).toBe("claude-haiku-5-5");
    expect(recapRequests[0].messages[0].content).toContain("Narrator: Welcome.");
    const save = await stores.campaigns.get("u", campaign.campaignId);
    expect(save?.memory.sessionRecaps).toEqual([expect.objectContaining({ sessionNo: 1, summary: RECAP.summary, leftOff: RECAP.left_off })]);
    expect(save?.memory.nextSessionHooks).toEqual(RECAP.next_session_hooks);

    const sessions = Array.from(_debug.sessions.values()).sort((a, b) => a.sessionNo - b.sessionNo);
    expect(sessions.map((s) => [s.sessionNo, !!s.endedAt, !!s.recappedAt])).toEqual([[1, true, true], [2, false, false]]);
    const opening = requests[1].messages[0].content[0].text;
    expect(opening).toContain("<last_session_recap>");
    expect(opening).toContain("This is session 2");
    // Recap charged at cost + 30%: Haiku 2,000 in × $0.10 + 300 out × $0.50 = 350 → 455.
    expect(_debug.ledger.get(`recap:${sessions[0].sessionId}`)).toMatchObject({ kind: "charge", amountMicros: -455 });
  });

  it("rolls a long session over mid-scene without a 'previously'", async () => {
    const { stores, campaign, _debug } = await setup();
    const { client, requests, recapRequests } = fakeClient([say("Go on."), say("The door opens.")]);
    const deps = { stores, client, emit: () => {} };
    await runTurn("u", campaign.campaignId, { type: "begin" }, deps);
    const first = Array.from(_debug.sessions.values())[0];
    const filler = "word ".repeat(ENGINE_CONFIG.rolloverTokens); // ~5 chars/word ≈ well past the limit
    first.messages.push({ role: "user", content: [{ type: "text", text: `<player>${filler}</player>` }] }, { role: "assistant", content: [{ type: "text", text: "Hm." }] });

    await runTurn("u", campaign.campaignId, { type: "text", text: "I open the door" }, deps);
    expect(recapRequests).toHaveLength(1);
    const opening = requests[1].messages[0].content[0].text;
    expect(opening).toContain("Continue from exactly where it stopped");
    expect(opening).toContain(`Where it stopped: ${RECAP.left_off}`);
    expect(requests[1].messages[0].content[1].text).toBe("<player>I open the door</player>");
    expect(JSON.stringify(requests[1].messages).length).toBeLessThan(20_000);
  });

  it("ends a session on request, and skips the recap when nothing happened", async () => {
    const { stores, campaign, _debug } = await setup();
    const { client, recapRequests } = fakeClient([say("Welcome.")]);
    const deps = { stores, client, emit: () => {} };
    expect(await endSession("u", campaign.campaignId, deps)).toBe(false); // no session yet
    await runTurn("u", campaign.campaignId, { type: "begin" }, deps);
    expect(await endSession("u", campaign.campaignId, deps)).toBe(true);
    expect(await endSession("u", campaign.campaignId, deps)).toBe(false); // already ended
    expect(recapRequests).toHaveLength(1);

    const empty = await createCampaign(stores, "u", { title: "E", storytellerId: "eldrath" });
    await stores.sessions.create({ sessionId: "s-empty", campaignId: empty.campaignId, ownerId: "u", sessionNo: 1, messages: [], startedAt: "x", lastActiveAt: new Date().toISOString() });
    expect(await endSession("u", empty.campaignId, deps)).toBe(true);
    expect(recapRequests).toHaveLength(1);
    expect(_debug.sessions.get("s-empty")?.endedAt).toBeTruthy();
  });

  it("still ends the session when the recap model refuses, charging what the call cost", async () => {
    const { stores, campaign, _debug } = await setup();
    const { client } = fakeClient([say("Welcome.")], { parsed: null, stop_reason: "refusal" });
    const deps = { stores, client, emit: () => {} };
    await runTurn("u", campaign.campaignId, { type: "begin" }, deps);
    await endSession("u", campaign.campaignId, deps);
    const [session] = Array.from(_debug.sessions.values());
    expect(session.endedAt).toBeTruthy();
    expect(session.recappedAt).toBeUndefined();
    expect((await stores.campaigns.get("u", campaign.campaignId))?.memory.sessionRecaps).toEqual([]);
    expect(_debug.ledger.get(`recap:${session.sessionId}`)?.amountMicros).toBe(-455);
  });
});

describe("money safety", () => {
  it("returns money left in a hold by a crashed turn before the next turn", async () => {
    const { stores, campaign, _debug } = await setup(USD);
    await stores.wallet.post({ refId: "turn:crashed:hold", userId: "u", amountMicros: -200_000, kind: "hold", requireFunds: true });
    _debug.ledger.get("turn:crashed:hold")!.createdAt = new Date(Date.now() - ENGINE_CONFIG.staleHoldMs - 1000).toISOString();
    await stores.wallet.post({ refId: "turn:recent:hold", userId: "u", amountMicros: -100_000, kind: "hold", requireFunds: true });

    const { client } = fakeClient([say("Hello.")]);
    await runTurn("u", campaign.campaignId, { type: "begin" }, { stores, client, emit: () => {} });
    expect(_debug.ledger.get("turn:crashed:release")).toMatchObject({ amountMicros: 200_000 });
    expect(_debug.ledger.has("turn:recent:release")).toBe(false); // possibly still running elsewhere
    expect(await stores.wallet.balance("u")).toBe(USD - 100_000 - 38);
  });

  it("lets one holder take a campaign lock until it's released or expires", async () => {
    const { stores } = createMemoryStores();
    const a = await stores.locks.acquire("k", 60_000);
    expect(a).toBeTruthy();
    expect(await stores.locks.acquire("k", 60_000)).toBeNull();
    await stores.locks.release("k", "wrong-token");
    expect(await stores.locks.acquire("k", 60_000)).toBeNull();
    await stores.locks.release("k", a!);
    const b = await stores.locks.acquire("k", 1);
    await new Promise((r) => setTimeout(r, 5));
    expect(await stores.locks.acquire("k", 60_000)).not.toBe(b);
  });
});
