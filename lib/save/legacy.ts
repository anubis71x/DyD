import { newSave, slugify } from "./reducer";
import { SaveFileSchema, type SaveFile } from "./schema";

/**
 * Converts the six legacy per-session collections (Character, Quest,
 * NpcsRelations, WorldState, MechanicsTracking, PlayerPreferences) into a
 * v1 save file. Pure, so it can be tested without a database. Input
 * shapes are loose on purpose: legacy documents were written by the model
 * through Vapi tools and are often partial.
 */

type Loose = Record<string, unknown> | null | undefined;

export interface LegacyBundle {
  session: { _id: unknown; uId: string; campaign?: string; createdAt?: Date | string; updatedAt?: Date | string };
  character?: Loose;
  quests?: Loose;
  npcsRelations?: Loose;
  worldState?: Loose;
  mechanicsTracking?: Loose;
  playerPreferences?: Loose;
}

const str = (v: unknown, max = 500): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
const strs = (v: unknown, max = 500): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => !!x) : [];
const numMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  const entries = v instanceof Map ? Array.from(v.entries()) : v && typeof v === "object" ? Object.entries(v) : [];
  for (const [k, val] of entries) {
    const n = typeof val === "number" ? val : Number(val);
    if (k && Number.isFinite(n)) out[String(k)] = n;
  }
  return out;
};
const iso = (d: unknown, fallback: string) => {
  const t = d instanceof Date ? d : typeof d === "string" ? new Date(d) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString() : fallback;
};

export function legacyToSave(b: LegacyBundle, campaignId: string, storytellerId: string, now: string): SaveFile {
  const createdAt = iso(b.session.createdAt, now);
  const save = newSave({
    campaignId,
    ownerId: b.session.uId,
    title: str(b.session.campaign) ?? "Untitled campaign",
    storytellerId,
    now: createdAt,
  });
  save.updatedAt = iso(b.session.updatedAt, now);

  const c = b.character ?? {};
  save.character = {
    name: str(c.name) ?? "",
    classRole: str(c.classRole) ?? "",
    attributes: numMap(c.keyAttributes),
    resources: Object.fromEntries(Object.entries(numMap(c.resources)).map(([k, v]) => [k, { current: v }])),
    abilities: strs(c.notableAbilities),
    inventory: strs(c.equipment).map((name) => ({ name, qty: 1 })),
    goals: strs(c.characterGoals),
  };

  const legacyQuests = Array.isArray(b.quests?.quests) ? (b.quests!.quests as Loose[]) : [];
  const usedQuestIds = new Set<string>();
  for (const q of legacyQuests) {
    if (!q) continue;
    const title = str(q.title) ?? "Untitled quest";
    let qid = slugify(title);
    while (usedQuestIds.has(qid)) qid += "-x";
    usedQuestIds.add(qid);
    const status = q.status === "completed" || q.status === "failed" ? q.status : "active";
    save.quests.push({
      id: qid,
      title,
      description: str(q.description, 8000) ?? "",
      status,
      objectives: strs(q.objectives).map((text) => ({ text, done: status === "completed" })),
      relatedNpcIds: strs(q.relatedNPCs).map(slugify),
    });
  }

  const legacyNpcs = Array.isArray(b.npcsRelations?.npcs) ? (b.npcsRelations!.npcs as Loose[]) : [];
  const usedNpcIds = new Set<string>();
  for (const n of legacyNpcs) {
    if (!n) continue;
    const name = str(n.name) ?? "Unknown";
    let nid = slugify(name);
    while (usedNpcIds.has(nid)) nid += "-x";
    usedNpcIds.add(nid);
    const disposition = n.relationship === "friendly" || n.relationship === "hostile" ? n.relationship : "neutral";
    save.npcs.push({
      id: nid,
      name,
      description: str(n.description, 8000) ?? "",
      disposition,
      ...(str(n.motivations) ? { motivations: str(n.motivations) } : {}),
      ...(str(n.lastInteraction) ? { lastInteraction: str(n.lastInteraction) } : {}),
      memorableLines: strs(n.dialogues).slice(-6),
    });
  }

  const w = b.worldState ?? {};
  const visited = strs(w.locationsVisited);
  const discovered = strs(w.newLocationsDiscovered);
  for (const name of Array.from(new Set([...visited, ...discovered]))) {
    save.world.locations.push({ name, discovered: true });
  }
  if (visited.length) save.world.currentLocation = visited[visited.length - 1];
  save.world.timeline = [...strs(w.factionChanges), ...strs(w.environmentalChanges)].slice(-60);
  const time = str(w.timeProgression);
  if (time) save.world.inGameTime = time;

  const m = b.mechanicsTracking ?? {};
  const rules = strs(m.systemRules);
  if (rules.length) save.mechanics.system = rules[0];
  save.mechanics.houseRules = [...rules.slice(1), ...strs(m.customRulesApplied)];
  save.mechanics.recentChecks = [...strs(m.combatEncounters), ...strs(m.skillChecks)].slice(-20);

  const p = b.playerPreferences ?? {};
  save.preferences = {
    language: "en",
    ...(str(p.gameStyle) ? { gameStyle: str(p.gameStyle) } : {}),
    ...(str(p.toneAtmosphere) ? { tone: str(p.toneAtmosphere) } : {}),
    ...(str(p.pacingPreferences) ? { pacing: str(p.pacingPreferences) } : {}),
    ...(str(p.interactionStyle) ? { interactionStyle: str(p.interactionStyle) } : {}),
    contentBoundaries: strs(p.contentBoundaries),
  };

  return SaveFileSchema.parse(save);
}
