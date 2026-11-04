import type { TranscriptLine } from "./events";
import { NARRATOR, parseSay } from "./sayParser";

type Block = { type?: string; text?: string };
type Msg = { role?: string; content?: string | Block[] };

const PLAYER = /<player>([\s\S]*?)<\/player>/;

/**
 * Rebuild the visible story feed from stored API messages. The session
 * opening (save file + instructions) and tool traffic are hidden; player
 * input, dice lines and the storyteller's narration/dialogue are shown.
 */
export function transcriptFromMessages(messages: unknown[]): TranscriptLine[] {
  const lines: TranscriptLine[] = [];
  for (const raw of messages as Msg[]) {
    const blocks: Block[] = typeof raw.content === "string" ? [{ type: "text", text: raw.content }] : raw.content ?? [];
    for (const b of blocks) {
      if (b.type !== "text" || !b.text) continue;
      if (raw.role === "user") {
        const m = PLAYER.exec(b.text);
        if (m) lines.push({ kind: "player", speaker: "player", text: m[1].trim() });
        else if (b.text.startsWith("[Dice] ")) lines.push({ kind: "dice", speaker: "player", text: b.text.slice(7) });
      } else if (raw.role === "assistant") {
        for (const p of parseSay(b.text)) {
          const text = p.text.trim();
          if (!text) continue;
          const last = lines[lines.length - 1];
          const kind = p.speaker === NARRATOR ? "narration" : "npc";
          if (last && last.kind === kind && last.speaker === p.speaker && last.mood === p.mood) last.text += ` ${text}`;
          else lines.push({ kind, speaker: p.speaker, ...(p.mood ? { mood: p.mood } : {}), text });
        }
      }
    }
  }
  return lines;
}
