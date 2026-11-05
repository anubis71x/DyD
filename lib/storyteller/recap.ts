import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { responseCost, type CostLine } from "@/lib/billing/pricing";
import type { SaveEvent, SaveFile } from "@/lib/save/schema";
import type { PlaySession, SessionCarry } from "@/lib/save/store";
import type { TranscriptLine } from "./events";
import { NARRATOR } from "./sayParser";
import { transcriptFromMessages } from "./transcript";

/**
 * Summaries written by a cheap, fast model from the visible story lines.
 *
 * - scope "part": compaction while the session is still going. Produces the
 *   carry-over (session so far + exactly where the scene stopped) that the
 *   next part of the session starts from.
 * - scope "session": the journal entry when a session really ends: the
 *   "previously on…" summary, quotes, open threads and the updated
 *   story-so-far, stored in the save file (memory.recap).
 */

export const RECAP_MODEL = "claude-haiku-5-5";

/** ~250K characters ≈ 70K tokens: keeps recap prompts under Haiku's 100K-token price step. */
const MAX_TRANSCRIPT_CHARS = 250_000;

const RecapSchema = z.object({
  summary: z.string().describe("Two to four sentences: what happened this session, in second person ('you')."),
  notable_quotes: z.array(z.string()).describe("Up to three memorable lines, each with the speaker's name, e.g. 'Venn: Port's closed.'"),
  next_session_hooks: z.array(z.string()).describe("One to three open threads or unanswered questions to pick up next time."),
  story_so_far: z.string().describe("The whole campaign so far in at most 250 words, updating the previous version with this session."),
  left_off: z.string().describe("Exactly where the scene stopped: who is present, what was just said or asked, any roll the player still has to make."),
});

/**
 * `event` (scope "session") and `carry` (both scopes) are null when no usable
 * summary came back; `costLines` is what the call cost either way.
 */
export type RecapResult = {
  event: Extract<SaveEvent, { type: "memory.recap" }> | null;
  carry: SessionCarry | null;
  costLines: CostLine[];
};

/** Every visible line of a session: earlier parts first, then the current part. */
export function sessionLines(session: Pick<PlaySession, "earlierLines" | "messages">): TranscriptLine[] {
  return [...(session.earlierLines ?? []), ...transcriptFromMessages(session.messages)];
}

function transcriptText(save: SaveFile, transcript: TranscriptLine[]): string {
  const names = new Map(save.npcs.map((n) => [n.id, n.name]));
  const player = save.character.name || "Player";
  const lines = transcript.map((l) => {
    if (l.kind === "player") return `${player}: ${l.text}`;
    if (l.kind === "dice") return `[Roll] ${l.text}`;
    if (l.kind === "narration" || l.speaker === NARRATOR) return `Narrator: ${l.text}`;
    return `${names.get(l.speaker) ?? l.speaker}: ${l.text}`;
  });
  let text = lines.join("\n");
  // Keep the end of the session if it is extremely long: that's what the next session needs.
  if (text.length > MAX_TRANSCRIPT_CHARS) text = `[…earlier part of the session omitted…]\n${text.slice(-MAX_TRANSCRIPT_CHARS)}`;
  return text;
}

/** Whether some lines contain anything worth summarizing. */
export function hasStory(lines: TranscriptLine[]): boolean {
  return lines.some((l) => l.kind === "narration" || l.kind === "npc");
}

/** Summarize a session (or the part of it so far). A missing summary is non-fatal for callers. */
export async function summarizeSession(
  client: Anthropic,
  save: SaveFile,
  sessionNo: number,
  lines: TranscriptLine[],
  now: string,
  opts: { scope: "part" | "session"; earlierSummary?: string },
): Promise<RecapResult> {
  const transcript = transcriptText(save, lines);
  const earlier = opts.earlierSummary ? `Earlier in this session (summary): ${opts.earlierSummary}\n\n` : "";
  const heading =
    opts.scope === "part"
      ? `Session ${sessionNo} is still in progress. Transcript of the latest stretch:`
      : `Transcript of session ${sessionNo}:`;
  const response = await client.messages.parse({
    model: RECAP_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(RecapSchema) },
    system:
      "You keep the campaign journal for a solo tabletop roleplaying game. Summaries are read aloud to the player at the start of the next session, so write plain, vivid prose with no markdown. Stick to what happened in the transcript; don't invent events.",
    messages: [
      {
        role: "user",
        content: `Campaign: ${save.title}
Player character: ${save.character.name || "not named yet"}${save.character.classRole ? `, ${save.character.classRole}` : ""}
Story so far before this session: ${save.memory.storySoFar || "(this was the first session)"}

${earlier}${heading}
${transcript}

${opts.scope === "part" ? "The summary must cover the whole session so far, including the earlier summary if given." : "The summary covers the whole session, including the earlier summary if given."}`,
      },
    ],
  });
  const costLines = responseCost(RECAP_MODEL, response.usage);
  const out = response.parsed_output;
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !out) {
    console.warn(`[recap] no recap for session ${sessionNo}: ${response.stop_reason}`);
    return { event: null, carry: null, costLines };
  }
  const clip = (s: string, n: number) => s.trim().slice(0, n);
  const carry: SessionCarry = {
    summary: clip(out.summary, 2000),
    leftOff: clip(out.left_off, 2000),
    openThreads: out.next_session_hooks.slice(0, 3).map((h) => clip(h, 400)),
  };
  if (opts.scope === "part") return { costLines, carry, event: null };
  return {
    costLines,
    carry,
    event: {
      type: "memory.recap",
      sessionNo,
      summary: clip(out.summary, 2000),
      notableQuotes: out.notable_quotes.slice(0, 3).map((q) => clip(q, 400)),
      nextSessionHooks: out.next_session_hooks.slice(0, 3).map((h) => clip(h, 400)),
      storySoFar: clip(out.story_so_far, 4000),
      leftOff: clip(out.left_off, 2000),
      date: now,
    },
  };
}
