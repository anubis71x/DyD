import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { responseCost, type CostLine } from "@/lib/billing/pricing";
import type { SaveEvent, SaveFile } from "@/lib/save/schema";
import { NARRATOR } from "./sayParser";
import { transcriptFromMessages } from "./transcript";

/**
 * End-of-session recaps. A cheap, fast model reads the session transcript and
 * writes the "previously on…" summary, hooks for next time, an updated
 * story-so-far, and exactly where the scene stopped. The result is stored in
 * the save file (memory.recap), so the next session starts from it.
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

/** `event` is null when no usable recap came back; `costLines` is what the call cost either way. */
export type RecapResult = { event: Extract<SaveEvent, { type: "memory.recap" }> | null; costLines: CostLine[] };

function transcriptText(save: SaveFile, messages: unknown[]): string {
  const names = new Map(save.npcs.map((n) => [n.id, n.name]));
  const player = save.character.name || "Player";
  const lines = transcriptFromMessages(messages).map((l) => {
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

/** Whether a session has anything worth recapping. */
export function hasStory(messages: unknown[]): boolean {
  return transcriptFromMessages(messages).some((l) => l.kind === "narration" || l.kind === "npc");
}

/** Summarize one session. A missing recap is non-fatal for callers. */
export async function summarizeSession(
  client: Anthropic,
  save: SaveFile,
  sessionNo: number,
  messages: unknown[],
  now: string,
): Promise<RecapResult> {
  const transcript = transcriptText(save, messages);
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

Transcript of session ${sessionNo}:
${transcript}`,
      },
    ],
  });
  const costLines = responseCost(RECAP_MODEL, response.usage);
  const out = response.parsed_output;
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens" || !out) {
    console.warn(`[recap] no recap for session ${sessionNo}: ${response.stop_reason}`);
    return { event: null, costLines };
  }
  const clip = (s: string, n: number) => s.trim().slice(0, n);
  return {
    costLines,
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
