import type { SaveFile } from "@/lib/save/schema";
import { REPLY_LENGTH_INFO, type ReplyLength } from "@/lib/storyteller/replyLength";
import { NARRATOR, parseSay } from "@/lib/storyteller/sayParser";

/**
 * Checks for a playtest: what a storyteller reply did wrong, judged from the
 * raw API content and the save file after the turn. Used by scripts/play.ts.
 * Heuristics, not rules: a finding is something to look at, not proof of a bug.
 */

export type Severity = "error" | "warn" | "info";

export interface Finding {
  severity: Severity;
  code: string;
  detail: string;
}

type Block = { type: string; text?: string; name?: string; input?: unknown; id?: string };

const SAY_OPEN = /<say\b[^>]*>/gi;
const SAY_CLOSE = /<\/say\s*>/gi;
const ANY_TAG = /<\/?([a-z_][\w-]*)\b[^>]*>/gi;
/** Straight or curly double quotes around a few words. */
const QUOTED = /(?:"[^"\n]{4,}"|“[^”\n]{4,}”)/;
const MARKDOWN = /(\*\*[^*]+\*\*|^#{1,6}\s|^\s*[-*]\s+\S|^\s*\d+\.\s+\S|`[^`]+`)/m;
const INVENTED_ROLL = /\b(you|they|he|she|it)\s+roll(?:ed|s)?\s+(?:a|an)\s+\d+/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => (s.match(/[.!?…]+(?=\s|$|["”'’)])/g) ?? []).length || (s.trim() ? 1 : 0);

/** Check the say-tag markup of one reply's text. */
export function auditSpeakerTags(text: string, save: SaveFile): Finding[] {
  const out: Finding[] = [];
  const opens = text.match(SAY_OPEN)?.length ?? 0;
  const closes = text.match(SAY_CLOSE)?.length ?? 0;
  if (opens !== closes) out.push({ severity: "error", code: "say.unbalanced", detail: `${opens} <say> vs ${closes} </say>` });

  // Nesting: an open before the previous one closed.
  let depth = 0;
  for (const m of Array.from(text.matchAll(/<(\/?)say\b[^>]*>/gi))) {
    depth += m[1] ? -1 : 1;
    if (depth > 1) {
      out.push({ severity: "error", code: "say.nested", detail: "a <say> opened inside another" });
      break;
    }
  }

  for (const m of Array.from(text.matchAll(ANY_TAG))) {
    const tag = m[1].toLowerCase();
    if (tag !== "say") out.push({ severity: "warn", code: "tag.unexpected", detail: `<${m[1]}> in the reply (spoken aloud as text)` });
  }
  for (const m of Array.from(text.matchAll(SAY_OPEN))) {
    if (!/\bwho\s*=/.test(m[0])) out.push({ severity: "error", code: "say.no_who", detail: m[0] });
  }

  const npcs = new Map(save.npcs.map((n) => [n.id, n]));
  const seen = new Set<string>();
  for (const p of parseSay(text)) {
    if (p.speaker === NARRATOR) {
      if (QUOTED.test(p.text)) out.push({ severity: "warn", code: "say.untagged_dialogue", detail: clip(p.text.match(QUOTED)![0]) });
      continue;
    }
    if (seen.has(p.speaker)) continue;
    seen.add(p.speaker);
    if (p.speaker === "player" || p.speaker === save.character.name.toLowerCase()) {
      out.push({ severity: "error", code: "say.player_voiced", detail: `the storyteller spoke as the player (${p.speaker})` });
      continue;
    }
    const npc = npcs.get(p.speaker);
    if (!npc) out.push({ severity: "error", code: "say.unknown_speaker", detail: `who="${p.speaker}" is not in the cast (${save.npcs.map((n) => n.id).join(", ") || "empty"})` });
    else if (!npc.voiceId) out.push({ severity: "warn", code: "say.no_voice", detail: `${p.speaker} speaks but has no cast voice` });
    if (!p.text.trim()) out.push({ severity: "warn", code: "say.empty", detail: `empty line for ${p.speaker}` });
  }
  return out;
}

/** Style checks for text that is read aloud. */
export function auditStyle(text: string, length: ReplyLength = "standard"): Finding[] {
  const out: Finding[] = [];
  const plain = text.replace(/<[^>]+>/g, "");
  if (MARKDOWN.test(plain)) out.push({ severity: "warn", code: "style.markdown", detail: clip(plain.match(MARKDOWN)![0]) });
  if (/\p{Extended_Pictographic}/u.test(plain)) out.push({ severity: "warn", code: "style.emoji", detail: "emoji in a spoken reply" });
  const w = words(plain);
  const s = sentences(plain);
  const max = REPLY_LENGTH_INFO[length].maxWords;
  if (w > max) out.push({ severity: "warn", code: "style.long", detail: `${w} words, ${s} sentences (over ${max} words for "${length}")` });
  if (length === "rich" && w < 40 && s > 0) out.push({ severity: "info", code: "style.short", detail: `${w} words on "rich"` });
  if (INVENTED_ROLL.test(plain)) out.push({ severity: "warn", code: "dice.invented", detail: clip(plain.match(INVENTED_ROLL)![0]) });
  return out;
}

export interface CallRecord {
  content: Block[];
  stopReason: string | null;
}

/**
 * Checks across one whole turn (every model call in it). `save` is the save
 * after the turn; `before` is the save before it.
 */
export function auditTurn(calls: CallRecord[], before: SaveFile, save: SaveFile, toolErrors: string[], length: ReplyLength = "standard"): Finding[] {
  const out: Finding[] = [];
  const blocks = calls.flatMap((c) => c.content);
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
  const tools = blocks.filter((b) => b.type === "tool_use");
  const names = tools.map((t) => t.name ?? "");

  out.push(...auditSpeakerTags(text, save), ...auditStyle(text, length));
  for (const e of toolErrors) out.push({ severity: "error", code: "tool.error", detail: e });

  // A new NPC should be added and cast in the same turn.
  const added = save.npcs.filter((n) => !before.npcs.some((b) => b.id === n.id));
  for (const n of added) if (!n.voiceId) out.push({ severity: "warn", code: "cast.missing", detail: `${n.id} added without cast_voice` });

  // update_npc then cast_voice with a different id than update_npc returned.
  for (const t of tools.filter((t) => t.name === "cast_voice")) {
    const id = (t.input as { npc_id?: string })?.npc_id;
    if (id && !save.npcs.some((n) => n.id === id)) out.push({ severity: "error", code: "cast.unknown_npc", detail: `cast_voice for "${id}"` });
  }

  if (names.includes("request_roll")) {
    const i = names.indexOf("request_roll");
    const after = blocks.slice(blocks.indexOf(tools[i]) + 1).filter((b) => b.type === "text" && (b.text ?? "").trim());
    if (after.length) out.push({ severity: "warn", code: "roll.kept_talking", detail: "text after request_roll in the same turn" });
    if (names.filter((n) => n === "request_roll").length > 1) out.push({ severity: "warn", code: "roll.multiple", detail: "more than one request_roll in a turn" });
  }
  if (names.filter((n) => n === "offer_choices").length > 1) out.push({ severity: "warn", code: "choices.multiple", detail: "offer_choices called more than once" });
  if (names.filter((n) => n === "illustrate").length > 1) out.push({ severity: "info", code: "illustrate.multiple", detail: "illustrate called more than once" });

  // Narration repeated in a later call of the same turn (read aloud twice).
  const seen = new Set<string>();
  for (const c of calls) {
    const mine = new Set<string>();
    for (const b of c.content) {
      if (b.type !== "text") continue;
      for (const sent of (b.text ?? "").replace(/<[^>]+>/g, "").split(/(?<=[.!?…])\s+/)) {
        const k = sent.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
        if (k.split(" ").length < 5) continue;
        if (seen.has(k)) {
          out.push({ severity: "warn", code: "reply.repeated", detail: clip(sent) });
          break;
        }
        mine.add(k);
      }
    }
    mine.forEach((k) => seen.add(k));
  }

  const last = calls[calls.length - 1];
  if (last?.stopReason === "max_tokens") out.push({ severity: "error", code: "stop.max_tokens", detail: "reply cut off" });
  if (last?.stopReason === "refusal") out.push({ severity: "error", code: "stop.refusal", detail: "model refused" });
  if (!text.trim() && !names.includes("request_roll")) out.push({ severity: "warn", code: "reply.empty", detail: "no narration this turn" });
  return out;
}

function clip(s: string, n = 90) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
