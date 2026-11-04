import { z } from "zod";

/**
 * Dreampool save file, version 1.
 *
 * One JSON document per campaign. The current state is a snapshot built by
 * applying `SaveEvent`s in order (see reducer.ts). Keep this file free of
 * server-only imports: the client renders the same shape.
 */

export const SAVE_SCHEMA_VERSION = 1 as const;

const id = z.string().min(1).max(80);
const shortText = z.string().max(500);
const longText = z.string().max(8000);

export const Disposition = z.enum(["friendly", "neutral", "hostile"]);
export const QuestStatus = z.enum(["active", "completed", "failed"]);

export const ResourceSchema = z.object({
  current: z.number(),
  max: z.number().optional(),
});

export const InventoryItemSchema = z.object({
  name: shortText,
  qty: z.number().int().min(0),
  notes: shortText.optional(),
});

export const CharacterSchema = z.object({
  name: shortText,
  classRole: shortText,
  level: z.number().int().min(0).optional(),
  attributes: z.record(z.number()),
  resources: z.record(ResourceSchema),
  abilities: z.array(shortText),
  inventory: z.array(InventoryItemSchema),
  goals: z.array(shortText),
  backstory: longText.optional(),
});

export const QuestSchema = z.object({
  id,
  title: shortText,
  description: longText,
  status: QuestStatus,
  objectives: z.array(z.object({ text: shortText, done: z.boolean() })),
  relatedNpcIds: z.array(id),
});

export const NpcSchema = z.object({
  id,
  name: shortText,
  description: longText,
  disposition: Disposition,
  motivations: shortText.optional(),
  lastInteraction: shortText.optional(),
  memorableLines: z.array(shortText),
  voiceId: id.optional(),
  portraitAssetId: id.optional(),
});

export const LocationSchema = z.object({
  name: shortText,
  discovered: z.boolean(),
  notes: shortText.optional(),
});

export const FactionSchema = z.object({
  name: shortText,
  standing: z.number(),
  notes: shortText.optional(),
});

export const AssetSchema = z.object({
  id,
  kind: z.enum(["image", "handout", "map"]),
  url: z.string().max(2000).optional(),
  title: shortText,
  prompt: longText.optional(),
  body: longText.optional(),
  subject: z
    .object({ type: z.enum(["npc", "location", "scene"]), id: z.string().max(80) })
    .optional(),
  createdAt: z.string(),
});

export const SaveFileSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  campaignId: id,
  ownerId: z.string().min(1),
  title: shortText,
  storytellerId: id,
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().min(0),

  character: CharacterSchema,
  quests: z.array(QuestSchema),
  npcs: z.array(NpcSchema),
  world: z.object({
    currentLocation: shortText.optional(),
    locations: z.array(LocationSchema),
    factions: z.array(FactionSchema),
    timeline: z.array(shortText),
    inGameTime: shortText.optional(),
  }),
  mechanics: z.object({
    system: shortText,
    houseRules: z.array(shortText),
    recentChecks: z.array(shortText),
  }),
  preferences: z.object({
    language: z.string().max(40),
    gameStyle: shortText.optional(),
    tone: shortText.optional(),
    pacing: shortText.optional(),
    interactionStyle: shortText.optional(),
    contentBoundaries: z.array(shortText),
  }),
  memory: z.object({
    storySoFar: longText,
    sessionRecaps: z.array(
      z.object({
        sessionNo: z.number().int().min(1),
        date: z.string(),
        summary: longText,
        notableQuotes: z.array(shortText),
      }),
    ),
    nextSessionHooks: z.array(shortText),
  }),
  assets: z.array(AssetSchema),
  generatedVoices: z.array(z.object({ voiceId: id, description: shortText, createdAt: z.string() })),
});

export type SaveFile = z.infer<typeof SaveFileSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Quest = z.infer<typeof QuestSchema>;
export type Npc = z.infer<typeof NpcSchema>;
export type Asset = z.infer<typeof AssetSchema>;

/* ------------------------------------------------------------------ */
/* Events: the only way a save file changes.                           */
/* ------------------------------------------------------------------ */

export const SaveEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("campaign.rename"), title: shortText }),
  z.object({
    type: z.literal("character.update"),
    patch: z
      .object({
        name: shortText,
        classRole: shortText,
        level: z.number().int().min(0),
        backstory: longText,
        attributes: z.record(z.number()),
        abilities: z.array(shortText),
        goals: z.array(shortText),
      })
      .partial(),
  }),
  z.object({
    type: z.literal("character.resource"),
    name: shortText,
    delta: z.number().optional(),
    set: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    type: z.literal("inventory.add"),
    name: shortText,
    qty: z.number().int().min(1),
    notes: shortText.optional(),
  }),
  z.object({ type: z.literal("inventory.remove"), name: shortText, qty: z.number().int().min(1) }),
  z.object({
    type: z.literal("quest.upsert"),
    id,
    title: shortText.optional(),
    description: longText.optional(),
    status: QuestStatus.optional(),
    addObjectives: z.array(shortText).optional(),
    relatedNpcIds: z.array(id).optional(),
  }),
  z.object({
    type: z.literal("quest.objective"),
    questId: id,
    text: shortText,
    done: z.boolean(),
  }),
  z.object({
    type: z.literal("npc.upsert"),
    id,
    name: shortText.optional(),
    description: longText.optional(),
    disposition: Disposition.optional(),
    motivations: shortText.optional(),
    lastInteraction: shortText.optional(),
    memorableLine: shortText.optional(),
  }),
  z.object({ type: z.literal("npc.voice"), npcId: id, voiceId: id }),
  z.object({
    type: z.literal("world.location"),
    name: shortText,
    discovered: z.boolean().optional(),
    notes: shortText.optional(),
    makeCurrent: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("world.faction"),
    name: shortText,
    standingDelta: z.number().optional(),
    notes: shortText.optional(),
  }),
  z.object({ type: z.literal("world.timeline"), entry: shortText }),
  z.object({ type: z.literal("world.time"), inGameTime: shortText }),
  z.object({ type: z.literal("mechanics.check"), entry: shortText }),
  z.object({ type: z.literal("mechanics.houseRule"), rule: shortText }),
  z.object({
    type: z.literal("preferences.update"),
    patch: z
      .object({
        language: z.string().max(40),
        gameStyle: shortText,
        tone: shortText,
        pacing: shortText,
        interactionStyle: shortText,
        contentBoundaries: z.array(shortText),
      })
      .partial(),
  }),
  z.object({ type: z.literal("asset.add"), asset: AssetSchema }),
  z.object({
    type: z.literal("voice.generated"),
    voiceId: id,
    description: shortText,
    createdAt: z.string(),
  }),
  z.object({
    type: z.literal("memory.recap"),
    summary: longText,
    notableQuotes: z.array(shortText),
    nextSessionHooks: z.array(shortText),
    storySoFar: longText,
    date: z.string(),
  }),
]);

export type SaveEvent = z.infer<typeof SaveEventSchema>;
export type SaveEventType = SaveEvent["type"];
