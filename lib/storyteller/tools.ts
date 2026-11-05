import { randomUUID } from "crypto";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { applyEvents, slugify } from "@/lib/save/reducer";
import type { SaveEvent, SaveFile } from "@/lib/save/schema";
import { castVoice } from "./casting";
import { checkOutcome, describeRoll, DiceError, parseNotation, roll } from "./dice";
import type { TableEvent } from "./events";
import { getStoryteller } from "./storytellers";

/**
 * Game tools. A tool never writes to the database itself: it returns save
 * events (committed by the engine in one batch) and table events for the UI.
 * The campaign and owner come from the authenticated request, never from
 * the model.
 */

export interface ToolContext {
  save: SaveFile; // includes events from earlier tools in the same batch
  now: string;
  rng?: (sides: number) => number;
}

export interface ToolOutcome {
  events: SaveEvent[];
  ui: TableEvent[];
  result: string;
  /** End the turn after this batch (e.g. waiting for the player's roll). */
  yieldToPlayer?: boolean;
}

interface ToolDef<S extends z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: Anthropic.Beta.BetaTool.InputSchema;
  schema: S;
  run(input: z.infer<S>, ctx: ToolContext): ToolOutcome;
}

const def = <S extends z.ZodTypeAny>(d: ToolDef<S>) => d;
const str = (description: string) => ({ type: "string", description });
const strArr = (description: string) => ({ type: "array", items: { type: "string" }, description });
const ok = (events: SaveEvent[], result: string, ui: TableEvent[] = []): ToolOutcome => ({ events, ui, result });

const sname = z.string().trim().min(1).max(200);

/** Cast a voice for a character from a description of how they sound. */
function castFor(save: SaveFile, npcId: string, npcName: string, description: string, now: string) {
  const st = getStoryteller(save.storytellerId);
  const used = save.npcs.filter((n) => n.id !== npcId && n.voiceId).map((n) => n.voiceId!);
  const cast = castVoice({ description, language: save.preferences.language, usedVoiceIds: used, reservedVoiceIds: [st.narrationVoiceId] });
  const events: SaveEvent[] = [{ type: "npc.voice", npcId, voiceId: cast.voiceId }];
  if (cast.generated) events.unshift({ type: "voice.generated", voiceId: cast.voiceId, description: description.slice(0, 200), createdAt: now });
  const ui: TableEvent[] = [{ type: "cast", npcId, voiceId: cast.voiceId, label: cast.label, generated: cast.generated }];
  return { events, ui, label: cast.label, npcName };
}

const TOOLS = [
  def({
    name: "update_character",
    description: "Set or change the player character's core details. Lists (abilities, goals) are added to, not replaced; attributes are merged.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Character name"),
        class_role: str("Class, role or archetype, e.g. 'Rogue' or 'Lighthouse keeper'"),
        level: { type: "integer", minimum: 0 },
        backstory: str("Short backstory"),
        attributes: { type: "object", additionalProperties: { type: "number" }, description: 'Ability scores, e.g. {"DEX": 16}' },
        abilities: strArr("Abilities or features to add"),
        goals: strArr("Personal goals to add"),
      },
    },
    schema: z.object({
      name: sname.optional(),
      class_role: sname.optional(),
      level: z.number().int().min(0).max(30).optional(),
      backstory: z.string().max(4000).optional(),
      attributes: z.record(z.number()).optional(),
      abilities: z.array(sname).optional(),
      goals: z.array(sname).optional(),
    }),
    run(i) {
      const patch = {
        ...(i.name ? { name: i.name } : {}),
        ...(i.class_role ? { classRole: i.class_role } : {}),
        ...(i.level !== undefined ? { level: i.level } : {}),
        ...(i.backstory ? { backstory: i.backstory } : {}),
        ...(i.attributes ? { attributes: i.attributes } : {}),
        ...(i.abilities ? { abilities: i.abilities } : {}),
        ...(i.goals ? { goals: i.goals } : {}),
      };
      return ok([{ type: "character.update", patch }], "Character updated.");
    },
  }),

  def({
    name: "adjust_resource",
    description: "Change a tracked resource such as HP, spell slots, gold or luck. Use delta for changes (-5 for damage) or set for an exact value. Values never go below 0 or above max.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Resource name, e.g. HP, Gold, Spell slots (level 1)"),
        delta: { type: "number" },
        set: { type: "number" },
        max: { type: "number", description: "Set or change the maximum" },
      },
      required: ["name"],
    },
    schema: z.object({ name: sname, delta: z.number().optional(), set: z.number().optional(), max: z.number().optional() }),
    run(i, ctx) {
      const next = applyEvents(ctx.save, [{ type: "character.resource", ...i }], ctx.now).character.resources[i.name];
      return ok([{ type: "character.resource", ...i }], `${i.name} is now ${next.current}${next.max !== undefined ? ` / ${next.max}` : ""}.`);
    },
  }),

  def({
    name: "change_inventory",
    description: "Add items to or remove items from the player character's inventory.",
    inputSchema: {
      type: "object",
      properties: {
        add: { type: "array", items: { type: "object", properties: { name: { type: "string" }, qty: { type: "integer", minimum: 1 }, notes: { type: "string" } }, required: ["name"] } },
        remove: { type: "array", items: { type: "object", properties: { name: { type: "string" }, qty: { type: "integer", minimum: 1 } }, required: ["name"] } },
      },
    },
    schema: z.object({
      add: z.array(z.object({ name: sname, qty: z.number().int().min(1).default(1), notes: z.string().max(300).optional() })).optional(),
      remove: z.array(z.object({ name: sname, qty: z.number().int().min(1).default(1) })).optional(),
    }),
    run(i) {
      const events: SaveEvent[] = [
        ...(i.add ?? []).map((a) => ({ type: "inventory.add" as const, name: a.name, qty: a.qty, ...(a.notes ? { notes: a.notes } : {}) })),
        ...(i.remove ?? []).map((r) => ({ type: "inventory.remove" as const, name: r.name, qty: r.qty })),
      ];
      return ok(events, "Inventory updated.");
    },
  }),

  def({
    name: "update_quest",
    description: "Create or update a quest. Pass the quest id from the save file to update one; omit it to create a new quest from the title. Objectives listed in complete_objectives are marked done.",
    inputSchema: {
      type: "object",
      properties: {
        id: str("Existing quest id"),
        title: str("Quest title"),
        description: str("What the quest is about"),
        status: { type: "string", enum: ["active", "completed", "failed"] },
        add_objectives: strArr("New objectives"),
        complete_objectives: strArr("Objective texts to mark done"),
        related_npc_ids: strArr("Ids of characters involved"),
      },
    },
    schema: z
      .object({
        id: z.string().max(80).optional(),
        title: sname.optional(),
        description: z.string().max(4000).optional(),
        status: z.enum(["active", "completed", "failed"]).optional(),
        add_objectives: z.array(sname).optional(),
        complete_objectives: z.array(sname).optional(),
        related_npc_ids: z.array(z.string().max(80)).optional(),
      })
      .refine((i) => i.id || i.title, "Give an id to update a quest or a title to create one."),
    run(i) {
      const id = i.id ? slugify(i.id) : slugify(i.title!);
      const events: SaveEvent[] = [
        {
          type: "quest.upsert",
          id,
          ...(i.title ? { title: i.title } : {}),
          ...(i.description ? { description: i.description } : {}),
          ...(i.status ? { status: i.status } : {}),
          ...(i.add_objectives ? { addObjectives: i.add_objectives } : {}),
          ...(i.related_npc_ids ? { relatedNpcIds: i.related_npc_ids.map(slugify) } : {}),
        },
        ...(i.complete_objectives ?? []).map((text) => ({ type: "quest.objective" as const, questId: id, text, done: true })),
      ];
      return ok(events, `Quest "${id}" updated.`);
    },
  }),

  def({
    name: "update_npc",
    description: "Create or update a non-player character. Returns the character's id, which you use in <say who=\"...\">. Call this before a new character's first line. A new character is given a voice from `voice` (or from the description if you leave it out); use cast_voice only to change it.",
    inputSchema: {
      type: "object",
      properties: {
        name: str("Display name. Required for a new character"),
        id: str("Existing id, when updating a known character"),
        description: str("Appearance and role, one or two sentences"),
        disposition: { type: "string", enum: ["friendly", "neutral", "hostile"] },
        motivations: str("What they want"),
        last_interaction: str("One line on what just happened between them and the player"),
        memorable_line: str("A line of theirs worth remembering"),
        voice: str("How a new character sounds (age, gender or none, accent, texture, manner), e.g. 'old sailor, gravelly, suspicious'"),
      },
    },
    // Updating a known character by id doesn't need the name again (every model in playtests left it out).
    schema: z.object({
      name: sname.optional(),
      id: z.string().trim().min(1).max(80).optional(),
      description: z.string().max(2000).optional(),
      disposition: z.enum(["friendly", "neutral", "hostile"]).optional(),
      motivations: z.string().max(400).optional(),
      last_interaction: z.string().max(400).optional(),
      memorable_line: z.string().max(400).optional(),
      voice: z.string().max(300).optional(),
    }).refine((i) => i.name || i.id, { message: "Give a name (new character) or the id of a known one", path: ["name"] }),
    run(i, ctx) {
      const byName = i.name ? ctx.save.npcs.find((n) => n.name.toLowerCase() === i.name!.toLowerCase())?.id : undefined;
      const id = i.id ? slugify(i.id) : (byName ?? slugify(i.name!));
      const existing = ctx.save.npcs.find((n) => n.id === id);
      if (!existing && !i.name) return ok([], `No character with id "${id}". To add a new character, give a name.`);
      const event: SaveEvent = {
        type: "npc.upsert",
        id,
        ...(i.name ? { name: i.name } : {}),
        ...(i.description ? { description: i.description } : {}),
        ...(i.disposition ? { disposition: i.disposition } : {}),
        ...(i.motivations ? { motivations: i.motivations } : {}),
        ...(i.last_interaction ? { lastInteraction: i.last_interaction } : {}),
        ...(i.memorable_line ? { memorableLine: i.memorable_line } : {}),
      };
      // Every character gets a voice as soon as they exist: in playtests models often
      // skipped the separate cast_voice call and then gave the character lines.
      if (existing?.voiceId) return ok([event], `Character id: ${id}. They already have a voice.`);
      const name = i.name ?? existing?.name ?? id;
      const after = applyEvents(ctx.save, [event], ctx.now);
      const cast = castFor(after, id, name, i.voice || i.description || name, ctx.now);
      return ok([event, ...cast.events], `Character id: ${id}. ${name} speaks with the voice "${cast.label}".`, cast.ui);
    },
  }),

  def({
    name: "cast_voice",
    description: "Change a character's voice for the rest of the campaign (new characters already get one from update_npc). Describe how they should sound (age, gender or none, accent, texture, manner); the app picks the closest voice from its library or makes a custom one.",
    inputSchema: {
      type: "object",
      properties: {
        npc_id: str("Character id from update_npc"),
        description: str("How they sound, e.g. 'old sailor, gravelly, suspicious' or 'ancient dragon, slow, cavernous'"),
      },
      required: ["npc_id", "description"],
    },
    schema: z.object({ npc_id: z.string().min(1).max(80), description: z.string().min(2).max(300) }),
    run(i, ctx) {
      const npcId = slugify(i.npc_id);
      const npc = ctx.save.npcs.find((n) => n.id === npcId);
      if (!npc) return ok([], `No character with id "${npcId}". Call update_npc first.`);
      const cast = castFor(ctx.save, npcId, npc.name, i.description, ctx.now);
      return ok(cast.events, `${npc.name} now speaks with the voice "${cast.label}".`, cast.ui);
    },
  }),

  def({
    name: "update_world",
    description: "Record changes to the world: a location (and whether the player is now there), a faction's standing with the player, a notable event, or the in-game time.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "object", properties: { name: { type: "string" }, notes: { type: "string" }, player_is_here: { type: "boolean" } }, required: ["name"] },
        faction: { type: "object", properties: { name: { type: "string" }, standing_delta: { type: "number" }, notes: { type: "string" } }, required: ["name"] },
        event: str("A notable event, one line, for the timeline"),
        in_game_time: str("e.g. 'Night of the third day'"),
      },
    },
    schema: z.object({
      location: z.object({ name: sname, notes: z.string().max(400).optional(), player_is_here: z.boolean().optional() }).optional(),
      faction: z.object({ name: sname, standing_delta: z.number().optional(), notes: z.string().max(400).optional() }).optional(),
      event: z.string().max(400).optional(),
      in_game_time: z.string().max(200).optional(),
    }),
    run(i) {
      const events: SaveEvent[] = [];
      if (i.location) events.push({ type: "world.location", name: i.location.name, discovered: true, ...(i.location.notes ? { notes: i.location.notes } : {}), ...(i.location.player_is_here ? { makeCurrent: true } : {}) });
      if (i.faction) events.push({ type: "world.faction", name: i.faction.name, ...(i.faction.standing_delta !== undefined ? { standingDelta: i.faction.standing_delta } : {}), ...(i.faction.notes ? { notes: i.faction.notes } : {}) });
      if (i.event) events.push({ type: "world.timeline", entry: i.event });
      if (i.in_game_time) events.push({ type: "world.time", inGameTime: i.in_game_time });
      return ok(events, "World updated.");
    },
  }),

  def({
    name: "set_preferences",
    description: "Record what the player wants from the game: language, tone, pacing, play style, reply length, house rules, and content boundaries (topics to avoid, treated as hard limits).",
    inputSchema: {
      type: "object",
      properties: {
        language: str("BCP-47 code, e.g. en, es, ja"),
        tone: { type: "string" },
        pacing: { type: "string" },
        game_style: { type: "string" },
        interaction_style: { type: "string" },
        reply_length: { type: "string", enum: ["brief", "standard", "rich"], description: "Only when the player asks for shorter or longer replies" },
        content_boundaries: strArr("Topics to avoid"),
        house_rule: str("A rule the player and storyteller agreed on"),
      },
    },
    schema: z.object({
      language: z.string().min(2).max(40).optional(),
      tone: z.string().max(200).optional(),
      pacing: z.string().max(200).optional(),
      game_style: z.string().max(200).optional(),
      interaction_style: z.string().max(200).optional(),
      reply_length: z.enum(["brief", "standard", "rich"]).optional(),
      content_boundaries: z.array(sname).optional(),
      house_rule: z.string().max(300).optional(),
    }),
    run(i) {
      const patch = {
        ...(i.language ? { language: i.language } : {}),
        ...(i.tone ? { tone: i.tone } : {}),
        ...(i.pacing ? { pacing: i.pacing } : {}),
        ...(i.game_style ? { gameStyle: i.game_style } : {}),
        ...(i.interaction_style ? { interactionStyle: i.interaction_style } : {}),
        ...(i.reply_length ? { replyLength: i.reply_length } : {}),
        ...(i.content_boundaries ? { contentBoundaries: i.content_boundaries } : {}),
      };
      const events: SaveEvent[] = [];
      if (Object.keys(patch).length) events.push({ type: "preferences.update", patch });
      if (i.house_rule) events.push({ type: "mechanics.houseRule", rule: i.house_rule });
      return ok(events, "Preferences recorded.");
    },
  }),

  def({
    name: "request_roll",
    description: "Ask the player to roll for an uncertain action they are taking. The app shows a dice prompt and the turn ends; the result arrives as a [Dice] line in the next message.",
    inputSchema: {
      type: "object",
      properties: {
        label: str("What the roll is for, e.g. 'Sleight of Hand check'"),
        notation: str("Dice notation including the character's modifier, e.g. d20+5"),
        dc: { type: "integer", minimum: 1, maximum: 40 },
        advantage: { type: "string", enum: ["none", "advantage", "disadvantage"], description: "Only when the rules grant it" },
      },
      required: ["label", "notation"],
    },
    schema: z.object({
      label: sname,
      notation: z.string().max(20),
      dc: z.number().int().min(1).max(40).optional(),
      advantage: z.enum(["none", "advantage", "disadvantage"]).optional(),
    }),
    run(i) {
      try {
        parseNotation(i.notation);
      } catch (e) {
        if (e instanceof DiceError) return ok([], e.message);
        throw e;
      }
      // The engine stores this check; the player's roll uses these values, not the browser's.
      return {
        events: [],
        ui: [
          {
            type: "check",
            label: i.label,
            notation: i.notation,
            ...(i.dc !== undefined ? { dc: i.dc } : {}),
            ...(i.advantage && i.advantage !== "none" ? { advantage: i.advantage } : {}),
          },
        ],
        result: "The player has been asked to roll. End your reply now and wait for the result.",
        yieldToPlayer: true,
      };
    },
  }),

  def({
    name: "roll_dice",
    description: "Roll dice yourself for anything the player doesn't roll: enemy attacks and damage, hidden checks, random tables. Returns the real result.",
    inputSchema: {
      type: "object",
      properties: {
        notation: str("e.g. d20+4, 2d6+3, d100"),
        label: str("What it's for"),
        dc: { type: "integer", minimum: 1, maximum: 40 },
        advantage: { type: "string", enum: ["none", "advantage", "disadvantage"] },
      },
      required: ["notation", "label"],
    },
    schema: z.object({
      notation: z.string().max(20),
      label: sname,
      dc: z.number().int().min(1).max(40).optional(),
      advantage: z.enum(["none", "advantage", "disadvantage"]).optional(),
    }),
    run(i, ctx) {
      let r;
      try {
        r = roll(i.notation, i.advantage ?? "none", ctx.rng);
      } catch (e) {
        if (e instanceof DiceError) return ok([], e.message);
        throw e;
      }
      const line = describeRoll(r, i.label, i.dc);
      const outcome = checkOutcome(r, i.dc);
      return ok([{ type: "mechanics.check", entry: line }], line, [
        { type: "dice", by: "storyteller", label: i.label, roll: r, ...(i.dc !== undefined ? { dc: i.dc } : {}), ...(outcome ? { outcome } : {}) },
      ]);
    },
  }),

  def({
    name: "offer_choices",
    description: "Show two to four short suggested actions as buttons. The player can still say or type anything else.",
    inputSchema: { type: "object", properties: { choices: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } }, required: ["choices"] },
    schema: z.object({ choices: z.array(z.string().trim().min(1).max(80)).min(2).max(4) }),
    run(i) {
      return ok([], "Choices shown.", [{ type: "choices", choices: i.choices }]);
    },
  }),

  def({
    name: "illustrate",
    description: "Request an illustration for the scene panel: a new location, a character portrait or a striking moment. Describe it visually in one or two sentences.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("Short caption"),
        prompt: str("Visual description"),
        subject_type: { type: "string", enum: ["npc", "location", "scene"] },
        subject_id: str("Character id or location name"),
      },
      required: ["title", "prompt"],
    },
    schema: z.object({
      title: sname,
      prompt: z.string().min(5).max(1500),
      subject_type: z.enum(["npc", "location", "scene"]).optional(),
      subject_id: z.string().max(80).optional(),
    }),
    run(i, ctx) {
      const asset = {
        id: randomUUID(),
        kind: "image" as const,
        title: i.title,
        prompt: i.prompt,
        createdAt: ctx.now,
        ...(i.subject_type ? { subject: { type: i.subject_type, id: i.subject_id ?? "" } } : {}),
      };
      // No image provider is connected yet (open decision 9), so the request is
      // stored and shown as a placeholder. A worker can fill in `url` later.
      return ok([{ type: "asset.add", asset }], "Illustration requested.", [{ type: "image", asset, status: "unavailable" }]);
    },
  }),

  def({
    name: "show_handout",
    description: "Show the player a document to read: a letter, sign, poster, riddle or map note. Keep it short.",
    inputSchema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"] },
    schema: z.object({ title: sname, body: z.string().min(1).max(3000) }),
    run(i, ctx) {
      const asset = { id: randomUUID(), kind: "handout" as const, title: i.title, body: i.body, createdAt: ctx.now };
      return ok([{ type: "asset.add", asset }], "Handout shown.", [{ type: "handout", asset }]);
    },
  }),

  def({
    name: "set_ambience",
    description: "Set the background mood for music and sound in one to four words, e.g. tavern, storm, dungeon, forest night, battle, calm sea.",
    inputSchema: { type: "object", properties: { mood: { type: "string", description: "One to four words" } }, required: ["mood"] },
    // Clip rather than reject: a long mood is still a usable mood (Haiku wrote 60+ characters in playtests).
    schema: z.object({ mood: z.string().trim().min(2).max(300).transform((m) => m.slice(0, 60)) }),
    run(i) {
      return ok([], "Ambience set.", [{ type: "ambience", mood: i.mood }]);
    },
  }),

  def({
    name: "rename_campaign",
    description: "Give the campaign a title once its story has a shape.",
    inputSchema: { type: "object", properties: { title: { type: "string" } }, required: ["title"] },
    schema: z.object({ title: z.string().trim().min(2).max(80) }),
    run(i) {
      return ok([{ type: "campaign.rename", title: i.title }], "Campaign renamed.");
    },
  }),
];

const BY_NAME = new Map<string, ToolDef<z.ZodTypeAny>>(TOOLS.map((t) => [t.name, t as ToolDef<z.ZodTypeAny>]));

/** Tool definitions for the API, in a fixed order so the prompt cache holds. */
export const TOOL_PARAMS: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
  eager_input_streaming: true,
}));

export type ToolRunResult = ToolOutcome & { isError: boolean };

/** Validate and run one tool call. Never throws for bad model input. */
export function runTool(name: string, input: unknown, ctx: ToolContext): ToolRunResult {
  const tool = BY_NAME.get(name);
  if (!tool) return { events: [], ui: [], result: `Unknown tool "${name}".`, isError: true };
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      events: [],
      ui: [],
      result: `Invalid input for ${name}: ${issue?.path.join(".") || "input"} ${issue?.message ?? ""}`.trim(),
      isError: true,
    };
  }
  return { ...tool.run(parsed.data, ctx), isError: false };
}

export const TOOL_NAMES = TOOLS.map((t) => t.name);
