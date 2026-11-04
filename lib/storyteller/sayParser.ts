/**
 * Streaming parser for the storyteller's speaker markup.
 *
 *   Narration is plain text.
 *   <say who="harbormaster-venn" mood="wary">Dialogue.</say>
 *
 * Text can arrive split anywhere (mid-tag included), so the parser holds back
 * anything that might still turn into a tag. Each piece it emits carries the
 * speaker, so TTS can route it to the right voice as it streams.
 */

export const NARRATOR = "narrator";

export interface SpeechPiece {
  speaker: string; // NARRATOR or an npc id
  mood?: string;
  text: string;
}

const OPEN = /^<say\b([^>]*)>/i;
const CLOSE = /^<\/say\s*>/i;
const ATTR = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const MAX_TAG = 300;

export class SayParser {
  private buf = "";
  private speaker = NARRATOR;
  private mood: string | undefined;

  push(chunk: string): SpeechPiece[] {
    this.buf += chunk;
    const out: SpeechPiece[] = [];
    while (this.buf) {
      const lt = this.buf.indexOf("<");
      if (lt === -1) {
        this.emit(out, this.buf);
        this.buf = "";
        break;
      }
      if (lt > 0) this.emit(out, this.buf.slice(0, lt));
      const rest = this.buf.slice(lt);

      const open = OPEN.exec(rest);
      if (open) {
        const attrs = parseAttrs(open[1]);
        this.speaker = attrs.who || NARRATOR;
        this.mood = attrs.mood || undefined;
        this.buf = rest.slice(open[0].length);
        continue;
      }
      const close = CLOSE.exec(rest);
      if (close) {
        this.speaker = NARRATOR;
        this.mood = undefined;
        this.buf = rest.slice(close[0].length);
        continue;
      }
      if (couldBecomeTag(rest)) {
        this.buf = rest; // wait for more text
        break;
      }
      this.emit(out, "<");
      this.buf = rest.slice(1);
    }
    return out;
  }

  /** Emit whatever is held back (call at the end of a message). */
  flush(): SpeechPiece[] {
    const out: SpeechPiece[] = [];
    if (this.buf) this.emit(out, this.buf);
    this.buf = "";
    this.speaker = NARRATOR;
    this.mood = undefined;
    return out;
  }

  private emit(out: SpeechPiece[], text: string) {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.speaker === this.speaker && last.mood === this.mood) last.text += text;
    else out.push({ speaker: this.speaker, ...(this.mood ? { mood: this.mood } : {}), text });
  }
}

function couldBecomeTag(s: string): boolean {
  if (s.length > MAX_TAG) return false;
  const lower = s.toLowerCase();
  for (const cand of ["<say", "</say>"]) {
    if (cand.startsWith(lower)) return true; // a prefix like "<s" or "</sa"
  }
  return (lower.startsWith("<say") || lower.startsWith("</say")) && !s.includes(">");
}

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of Array.from(s.matchAll(ATTR))) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? "").trim();
  return out;
}

/** Parse a complete string at once. */
export function parseSay(text: string): SpeechPiece[] {
  const p = new SayParser();
  return mergePieces([...p.push(text), ...p.flush()]);
}

export function mergePieces(pieces: SpeechPiece[]): SpeechPiece[] {
  const out: SpeechPiece[] = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last.speaker === p.speaker && last.mood === p.mood) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}
