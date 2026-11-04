import { describe, expect, it } from "vitest";
import { legacyToSave } from "@/lib/save/legacy";
import { createMemoryStores } from "@/lib/save/memoryStore";
import { exportSave, ImportError, parseImport } from "@/lib/save/portable";
import { applyEvent, applyEvents, newSave, slugify } from "@/lib/save/reducer";
import { SaveFileSchema, type SaveFile } from "@/lib/save/schema";
import { adoptSave, commitEvents, createCampaign, NotFoundError } from "@/lib/save/service";

const NOW = "2026-11-04T12:00:00.000Z";
const base = (): SaveFile => newSave({ campaignId: "c1", ownerId: "u1", title: "Test", storytellerId: "eldrath", now: NOW });

describe("reducer", () => {
  it("starts with a schema-valid empty save", () => {
    expect(SaveFileSchema.safeParse(base()).success).toBe(true);
  });

  it("does not mutate the input and bumps the revision", () => {
    const s = base();
    const next = applyEvent(s, { type: "campaign.rename", title: "The Salt Lantern" }, NOW);
    expect(s.title).toBe("Test");
    expect(next.title).toBe("The Salt Lantern");
    expect(next.revision).toBe(1);
  });

  it("clamps resources between 0 and max", () => {
    let s = applyEvent(base(), { type: "character.resource", name: "HP", set: 30, max: 32 }, NOW);
    s = applyEvent(s, { type: "character.resource", name: "HP", delta: 10 }, NOW);
    expect(s.character.resources.HP).toEqual({ current: 32, max: 32 });
    s = applyEvent(s, { type: "character.resource", name: "HP", delta: -100 }, NOW);
    expect(s.character.resources.HP.current).toBe(0);
  });

  it("stacks and removes inventory by name, case-insensitively", () => {
    const s = applyEvents(
      base(),
      [
        { type: "inventory.add", name: "Torch", qty: 2 },
        { type: "inventory.add", name: "torch", qty: 1 },
        { type: "inventory.remove", name: "TORCH", qty: 3 },
        { type: "inventory.add", name: "Rope", qty: 1 },
      ],
      NOW,
    );
    expect(s.character.inventory).toEqual([{ name: "Rope", qty: 1 }]);
  });

  it("upserts quests and completes objectives", () => {
    const s = applyEvents(
      base(),
      [
        { type: "quest.upsert", id: "ledger", title: "The ledger", addObjectives: ["Steal the ledger", "Find the payer"] },
        { type: "quest.objective", questId: "ledger", text: "steal the ledger", done: true },
        { type: "quest.objective", questId: "missing", text: "ignored", done: true },
      ],
      NOW,
    );
    expect(s.quests).toHaveLength(1);
    expect(s.quests[0].objectives).toEqual([
      { text: "Steal the ledger", done: true },
      { text: "Find the payer", done: false },
    ]);
  });

  it("keeps only the most recent memorable lines and checks", () => {
    let s = base();
    for (let i = 0; i < 10; i++) s = applyEvent(s, { type: "npc.upsert", id: "venn", name: "Venn", memorableLine: `line ${i}` }, NOW);
    expect(s.npcs[0].memorableLines).toEqual(["line 4", "line 5", "line 6", "line 7", "line 8", "line 9"]);
    for (let i = 0; i < 25; i++) s = applyEvent(s, { type: "mechanics.check", entry: `c${i}` }, NOW);
    expect(s.mechanics.recentChecks).toHaveLength(20);
    expect(s.mechanics.recentChecks[0]).toBe("c5");
  });

  it("marks a location current and discovered", () => {
    const s = applyEvents(base(), [{ type: "world.location", name: "Lantern Quay", discovered: false }, { type: "world.location", name: "lantern quay", makeCurrent: true }], NOW);
    expect(s.world.locations).toEqual([{ name: "Lantern Quay", discovered: true }]);
    expect(s.world.currentLocation).toBe("Lantern Quay");
  });

  it("slugifies names into stable ids", () => {
    expect(slugify("Harbormaster Venn")).toBe("harbormaster-venn");
    expect(slugify("  Élodie d'Arc!! ")).toBe("elodie-d-arc");
    expect(slugify("???")).toBe("unnamed");
  });
});

describe("legacy migration", () => {
  it("converts the six legacy collections into a valid save", () => {
    const save = legacyToSave(
      {
        session: { _id: "s1", uId: "user_1", campaign: "Old Campaign", createdAt: new Date("2025-03-01") },
        character: {
          name: "Aria Nightshade",
          classRole: "Rogue",
          keyAttributes: new Map([["DEX", 18]]),
          resources: { HP: 32 },
          notableAbilities: ["Sneak Attack", ""],
          equipment: ["Dagger"],
          characterGoals: ["Retrieve the cursed gem"],
        },
        quests: { quests: [{ title: "Cursed Gem", status: "active", objectives: ["Find the vault"], relatedNPCs: ["Old Mara"] }] },
        npcsRelations: { npcs: [{ name: "Old Mara", relationship: "friendly", dialogues: ["Hush, child."] }, { name: "Old Mara" }] },
        worldState: { locationsVisited: ["Saltmarket", "Docks"], newLocationsDiscovered: ["Docks", "Vault"], timeProgression: "Day 3" },
        mechanicsTracking: { systemRules: ["5e"], skillChecks: ["Stealth 17"] },
        playerPreferences: { toneAtmosphere: "dark", contentBoundaries: ["spiders"] },
      },
      "c-new",
      "eldrath",
      NOW,
    );
    expect(save.ownerId).toBe("user_1");
    expect(save.character.attributes).toEqual({ DEX: 18 });
    expect(save.character.resources.HP).toEqual({ current: 32 });
    expect(save.character.abilities).toEqual(["Sneak Attack"]);
    expect(save.character.inventory).toEqual([{ name: "Dagger", qty: 1 }]);
    expect(save.quests[0]).toMatchObject({ id: "cursed-gem", relatedNpcIds: ["old-mara"] });
    expect(save.npcs.map((n) => n.id)).toEqual(["old-mara", "old-mara-x"]);
    expect(save.world.locations.map((l) => l.name)).toEqual(["Saltmarket", "Docks", "Vault"]);
    expect(save.world.currentLocation).toBe("Docks");
    expect(save.preferences).toMatchObject({ tone: "dark", contentBoundaries: ["spiders"] });
    expect(save.createdAt).toBe("2025-03-01T00:00:00.000Z");
  });

  it("handles a session with no child documents", () => {
    const save = legacyToSave({ session: { _id: "s", uId: "u" } }, "c", "lyra", NOW);
    expect(save.title).toBe("Untitled campaign");
    expect(save.character.name).toBe("");
  });
});

describe("portable .dydsave", () => {
  it("round-trips through export and import", () => {
    const s = applyEvent(base(), { type: "inventory.add", name: "Lantern", qty: 1 }, NOW);
    expect(parseImport(exportSave(s, NOW))).toEqual(SaveFileSchema.parse(s));
  });

  it("rejects tampered and foreign files", () => {
    const s = base();
    const zipped = exportSave(s, NOW);
    const { gunzipSync } = require("zlib") as typeof import("zlib");
    const env = JSON.parse(gunzipSync(zipped).toString());
    env.save.title = "Edited";
    expect(() => parseImport(Buffer.from(JSON.stringify(env)))).toThrow(/checksum/);
    expect(() => parseImport(Buffer.from('{"hello":1}'))).toThrow(ImportError);
    expect(() => parseImport(Buffer.from("not json"))).toThrow(ImportError);
  });
});

describe("service", () => {
  it("isolates campaigns by owner", async () => {
    const { stores } = createMemoryStores();
    const c = await createCampaign(stores, "alice", { title: "A", storytellerId: "eldrath" });
    await expect(commitEvents(stores, "mallory", c.campaignId, [{ type: "campaign.rename", title: "pwned" }], "user")).rejects.toThrow(NotFoundError);
    expect(await stores.campaigns.list("mallory")).toEqual([]);
    expect((await stores.campaigns.get("alice", c.campaignId))?.title).toBe("A");
  });

  it("logs events with the revisions they produced", async () => {
    const { stores, _debug } = createMemoryStores();
    const c = await createCampaign(stores, "u", { title: "A", storytellerId: "eldrath" });
    const next = await commitEvents(stores, "u", c.campaignId, [
      { type: "inventory.add", name: "Rope", qty: 1 },
      { type: "campaign.rename", title: "B" },
    ], "tool");
    expect(next.revision).toBe(2);
    expect(_debug.events.map((e) => e.revision)).toEqual([1, 2]);
  });

  it("retries when another writer bumps the revision", async () => {
    const { stores } = createMemoryStores();
    const c = await createCampaign(stores, "u", { title: "A", storytellerId: "eldrath" });
    const original = stores.campaigns.replaceIfRevision.bind(stores.campaigns);
    let raced = false;
    stores.campaigns.replaceIfRevision = async (save, expected) => {
      if (!raced) {
        raced = true;
        const cur = (await stores.campaigns.get("u", c.campaignId))!;
        await original(applyEvent(cur, { type: "inventory.add", name: "Coin", qty: 1 }, NOW), cur.revision);
      }
      return original(save, expected);
    };
    const next = await commitEvents(stores, "u", c.campaignId, [{ type: "inventory.add", name: "Rope", qty: 1 }], "tool");
    expect(next.character.inventory.map((i) => i.name)).toEqual(["Coin", "Rope"]);
    expect(next.revision).toBe(2);
  });

  it("adopts an imported save under the importer with a new id", async () => {
    const { stores } = createMemoryStores();
    const adopted = await adoptSave(stores, "bob", { ...base(), ownerId: "someone-else" });
    expect(adopted.ownerId).toBe("bob");
    expect(adopted.campaignId).not.toBe("c1");
  });
});
