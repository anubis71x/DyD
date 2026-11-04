import { DEFAULT_MODEL_ID, type ModelId } from "@/lib/storyteller/models";
import {
  SAVE_SCHEMA_VERSION,
  type Character,
  type SaveEvent,
  type SaveFile,
} from "./schema";

/** Caps that keep the save file small enough to send to the model in full. */
export const LIMITS = {
  recentChecks: 20,
  timeline: 60,
  memorableLines: 6,
  sessionRecaps: 30,
  assets: 200,
} as const;

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "unnamed";
}

export function emptyCharacter(): Character {
  return {
    name: "",
    classRole: "",
    attributes: {},
    resources: {},
    abilities: [],
    inventory: [],
    goals: [],
  };
}

export function newSave(params: {
  campaignId: string;
  ownerId: string;
  title: string;
  storytellerId: string;
  now: string;
  language?: string;
  modelId?: ModelId;
}): SaveFile {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    campaignId: params.campaignId,
    ownerId: params.ownerId,
    title: params.title,
    storytellerId: params.storytellerId,
    modelId: params.modelId ?? DEFAULT_MODEL_ID,
    createdAt: params.now,
    updatedAt: params.now,
    revision: 0,
    character: emptyCharacter(),
    quests: [],
    npcs: [],
    world: { locations: [], factions: [], timeline: [] },
    mechanics: { system: "5e-compatible (SRD)", houseRules: [], recentChecks: [] },
    preferences: { language: params.language ?? "en", contentBoundaries: [] },
    memory: { storySoFar: "", sessionRecaps: [], nextSessionHooks: [] },
    assets: [],
    generatedVoices: [],
  };
}

const uniq = <T,>(xs: T[]) => Array.from(new Set(xs));
const tail = <T,>(xs: T[], n: number) => (xs.length > n ? xs.slice(xs.length - n) : xs);
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Apply one event. Pure: returns a new object and never mutates `save`.
 * Unknown references (e.g. an objective on a missing quest) are ignored
 * rather than throwing, so a bad model call can't corrupt the save.
 */
export function applyEvent(save: SaveFile, event: SaveEvent, now: string): SaveFile {
  const s: SaveFile = structuredClone(save);
  s.revision += 1;
  s.updatedAt = now;

  switch (event.type) {
    case "campaign.rename":
      s.title = event.title;
      break;

    case "campaign.model":
      s.modelId = event.modelId;
      break;

    case "character.update": {
      const { attributes, abilities, goals, ...rest } = event.patch;
      Object.assign(s.character, rest);
      if (attributes) s.character.attributes = { ...s.character.attributes, ...attributes };
      if (abilities) s.character.abilities = uniq([...s.character.abilities, ...abilities]);
      if (goals) s.character.goals = uniq([...s.character.goals, ...goals]);
      break;
    }

    case "character.resource": {
      const prev = s.character.resources[event.name] ?? { current: 0 };
      const max = event.max ?? prev.max;
      let current = event.set ?? prev.current + (event.delta ?? 0);
      if (max !== undefined) current = Math.min(current, max);
      current = Math.max(0, current);
      s.character.resources[event.name] = max === undefined ? { current } : { current, max };
      break;
    }

    case "inventory.add": {
      const item = s.character.inventory.find((i) => sameName(i.name, event.name));
      if (item) {
        item.qty += event.qty;
        if (event.notes) item.notes = event.notes;
      } else {
        s.character.inventory.push({
          name: event.name,
          qty: event.qty,
          ...(event.notes ? { notes: event.notes } : {}),
        });
      }
      break;
    }

    case "inventory.remove": {
      const item = s.character.inventory.find((i) => sameName(i.name, event.name));
      if (item) {
        item.qty -= event.qty;
        if (item.qty <= 0) s.character.inventory = s.character.inventory.filter((i) => i !== item);
      }
      break;
    }

    case "quest.upsert": {
      let q = s.quests.find((x) => x.id === event.id);
      if (!q) {
        q = {
          id: event.id,
          title: event.title ?? event.id,
          description: "",
          status: "active",
          objectives: [],
          relatedNpcIds: [],
        };
        s.quests.push(q);
      }
      if (event.title !== undefined) q.title = event.title;
      if (event.description !== undefined) q.description = event.description;
      if (event.status !== undefined) q.status = event.status;
      for (const text of event.addObjectives ?? []) {
        if (!q.objectives.some((o) => sameName(o.text, text))) q.objectives.push({ text, done: false });
      }
      if (event.relatedNpcIds) q.relatedNpcIds = uniq([...q.relatedNpcIds, ...event.relatedNpcIds]);
      break;
    }

    case "quest.objective": {
      const q = s.quests.find((x) => x.id === event.questId);
      if (!q) break;
      const o = q.objectives.find((x) => sameName(x.text, event.text));
      if (o) o.done = event.done;
      else q.objectives.push({ text: event.text, done: event.done });
      break;
    }

    case "npc.upsert": {
      let n = s.npcs.find((x) => x.id === event.id);
      if (!n) {
        n = {
          id: event.id,
          name: event.name ?? event.id,
          description: "",
          disposition: "neutral",
          memorableLines: [],
        };
        s.npcs.push(n);
      }
      if (event.name !== undefined) n.name = event.name;
      if (event.description !== undefined) n.description = event.description;
      if (event.disposition !== undefined) n.disposition = event.disposition;
      if (event.motivations !== undefined) n.motivations = event.motivations;
      if (event.lastInteraction !== undefined) n.lastInteraction = event.lastInteraction;
      if (event.memorableLine) n.memorableLines = tail([...n.memorableLines, event.memorableLine], LIMITS.memorableLines);
      break;
    }

    case "npc.voice": {
      const n = s.npcs.find((x) => x.id === event.npcId);
      if (n) n.voiceId = event.voiceId;
      break;
    }

    case "world.location": {
      let loc = s.world.locations.find((l) => sameName(l.name, event.name));
      if (!loc) {
        loc = { name: event.name, discovered: event.discovered ?? true };
        s.world.locations.push(loc);
      }
      if (event.discovered !== undefined) loc.discovered = event.discovered;
      if (event.notes !== undefined) loc.notes = event.notes;
      if (event.makeCurrent) {
        s.world.currentLocation = loc.name;
        loc.discovered = true;
      }
      break;
    }

    case "world.faction": {
      let f = s.world.factions.find((x) => sameName(x.name, event.name));
      if (!f) {
        f = { name: event.name, standing: 0 };
        s.world.factions.push(f);
      }
      f.standing += event.standingDelta ?? 0;
      if (event.notes !== undefined) f.notes = event.notes;
      break;
    }

    case "world.timeline":
      s.world.timeline = tail([...s.world.timeline, event.entry], LIMITS.timeline);
      break;

    case "world.time":
      s.world.inGameTime = event.inGameTime;
      break;

    case "mechanics.check":
      s.mechanics.recentChecks = tail([...s.mechanics.recentChecks, event.entry], LIMITS.recentChecks);
      break;

    case "mechanics.houseRule":
      s.mechanics.houseRules = uniq([...s.mechanics.houseRules, event.rule]);
      break;

    case "preferences.update": {
      const { contentBoundaries, ...rest } = event.patch;
      Object.assign(s.preferences, rest);
      if (contentBoundaries) {
        s.preferences.contentBoundaries = uniq([...s.preferences.contentBoundaries, ...contentBoundaries]);
      }
      break;
    }

    case "asset.add":
      s.assets = tail([...s.assets.filter((a) => a.id !== event.asset.id), event.asset], LIMITS.assets);
      break;

    case "voice.generated":
      if (!s.generatedVoices.some((v) => v.voiceId === event.voiceId)) {
        s.generatedVoices.push({ voiceId: event.voiceId, description: event.description, createdAt: event.createdAt });
      }
      break;

    case "memory.recap": {
      const sessionNo = s.memory.sessionRecaps.length + 1;
      s.memory.sessionRecaps = tail(
        [...s.memory.sessionRecaps, { sessionNo, date: event.date, summary: event.summary, notableQuotes: event.notableQuotes }],
        LIMITS.sessionRecaps,
      );
      s.memory.nextSessionHooks = event.nextSessionHooks;
      s.memory.storySoFar = event.storySoFar;
      break;
    }

    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
  return s;
}

export function applyEvents(save: SaveFile, events: SaveEvent[], now: string): SaveFile {
  return events.reduce((acc, e) => applyEvent(acc, e, now), save);
}
