/**
 * Turns streamed speech (text deltas tagged with a speaker) into complete
 * utterances that a text-to-speech engine can say: one sentence at a time,
 * never mixing speakers. Speaking can start after the first sentence instead
 * of waiting for the whole reply. Client-safe and engine-agnostic: the
 * browser read-aloud uses it now, the voice pipeline later.
 */

export interface Utterance {
  speaker: string; // "narrator" or an npc id
  mood?: string;
  text: string;
}

/** A sentence ends at . ! ? or … (optionally followed by closing quotes/brackets), then whitespace. */
const BOUNDARY = /[.!?…]+["'”’)\]]*\s+/g;
/** Don't split after these (lowercase, without the dot). */
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "st", "mt", "vs", "etc", "e.g", "i.e", "sr", "jr", "lt", "capt", "sgt"]);
/** Very short fragments are held and joined to the next sentence, so speech doesn't stutter. */
const MIN_CHARS = 12;

export class UtteranceSegmenter {
  private buf = "";
  private speaker: string | null = null;
  private mood: string | undefined;

  /** Add a piece of streamed speech; returns any utterances now complete. */
  push(speaker: string, text: string, mood?: string): Utterance[] {
    const out: Utterance[] = [];
    if (this.speaker !== null && (speaker !== this.speaker || mood !== this.mood)) out.push(...this.flush());
    this.speaker = speaker;
    this.mood = mood;
    this.buf += text;

    let cut = 0;
    BOUNDARY.lastIndex = 0;
    for (let m = BOUNDARY.exec(this.buf); m; m = BOUNDARY.exec(this.buf)) {
      const end = m.index + m[0].length;
      const sentence = this.buf.slice(cut, end);
      const lastWord = /([A-Za-z.]+)[.!?…]+["'”’)\]]*\s+$/.exec(sentence)?.[1]?.toLowerCase().replace(/\.$/, "");
      if (lastWord && ABBREVIATIONS.has(lastWord)) continue;
      if (sentence.trim().length < MIN_CHARS) continue;
      out.push(this.make(sentence));
      cut = end;
    }
    this.buf = this.buf.slice(cut);
    return out;
  }

  /** Emit whatever is left (call when the reply or a speaker's line ends). */
  flush(): Utterance[] {
    const rest = this.buf;
    this.buf = "";
    return rest.trim() ? [this.make(rest)] : [];
  }

  private make(text: string): Utterance {
    return { speaker: this.speaker ?? "narrator", ...(this.mood ? { mood: this.mood } : {}), text: cleanForSpeech(text) };
  }
}

/** Remove things a voice shouldn't read: stage notes in brackets, markdown, extra spaces. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[*_#`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
