import { randomUUID } from "crypto";
import { z } from "zod";
import type { SaveFile } from "@/lib/save/schema";
import { commitEvents, loadCampaign } from "@/lib/save/service";
import type { FeedbackRecord, Stores } from "@/lib/save/store";
import { recastVoice } from "./casting";
import { sanitizePlayerText } from "./sanitize";
import { NARRATOR } from "./sayParser";
import { getStoryteller } from "./storytellers";
import { voiceLabel } from "./voices";

/**
 * Player feedback. Submitting never touches the turn in progress: it doesn't
 * take the campaign lock or edit the conversation. Feedback meant for the
 * storyteller is delivered at the start of the next turn; a voice recast is
 * applied to the save file right away.
 */

export { FEEDBACK_TAGS } from "./feedbackTags";
import { FEEDBACK_TAG_IDS, FEEDBACK_TAGS } from "./feedbackTags";

export const FeedbackInput = z
  .object({
    target: z.object({
      type: z.enum(["line", "character", "voice", "storyteller", "game"]),
      npcId: z.string().max(80).optional(),
      speaker: z.string().max(80).optional(),
      text: z.string().max(500).optional(),
    }),
    rating: z.enum(["up", "down"]).optional(),
    tags: z.array(z.enum(FEEDBACK_TAG_IDS)).max(6).default([]),
    comment: z.string().trim().max(500).optional(),
    tellStoryteller: z.boolean().default(true),
    recast: z.boolean().optional(),
  })
  .refine((f) => f.rating || f.tags.length || f.comment || f.recast, "Say something: a rating, a tag, a comment or a recast.")
  .refine((f) => !f.recast || f.target.npcId, "Pick a character to recast.");
export type FeedbackInput = z.infer<typeof FeedbackInput>;

export class FeedbackError extends Error {}

export async function submitFeedback(
  stores: Stores,
  ownerId: string,
  campaignId: string,
  input: FeedbackInput,
): Promise<{ save: SaveFile; recast?: { npcId: string; voiceId: string; label: string } }> {
  let save = await loadCampaign(stores, ownerId, campaignId);
  const session = await stores.sessions.latest(ownerId, campaignId);
  let recast: { npcId: string; voiceId: string; label: string } | undefined;

  if (input.recast && input.target.npcId) {
    const npc = save.npcs.find((n) => n.id === input.target.npcId);
    if (!npc) throw new FeedbackError("That character isn't in this campaign.");
    const choice = recastVoice({
      npc,
      ...(npc.voiceId ? { currentVoiceId: npc.voiceId } : {}),
      ...(input.comment ? { hint: input.comment } : {}),
      language: save.preferences.language,
      usedVoiceIds: save.npcs.filter((n) => n.id !== npc.id && n.voiceId).map((n) => n.voiceId!),
      reservedVoiceIds: [getStoryteller(save.storytellerId).narrationVoiceId],
    });
    if (!choice) throw new FeedbackError("No other voice fits this character's language yet.");
    // commitEvents is safe alongside a running turn (optimistic, retried).
    save = await commitEvents(stores, ownerId, campaignId, [{ type: "npc.voice", npcId: npc.id, voiceId: choice.voiceId }], "user");
    recast = { npcId: npc.id, voiceId: choice.voiceId, label: choice.label };
  }

  const record: FeedbackRecord = {
    id: randomUUID(),
    ownerId,
    campaignId,
    ...(session && !session.endedAt ? { sessionId: session.sessionId } : {}),
    storytellerId: save.storytellerId,
    ...(save.modelId ? { modelId: save.modelId } : {}),
    target: {
      type: input.target.type,
      ...(input.target.npcId ? { npcId: input.target.npcId } : {}),
      ...(input.target.speaker ? { speaker: input.target.speaker } : {}),
      ...(input.target.text ? { text: input.target.text } : {}),
    },
    ...(input.rating ? { rating: input.rating } : {}),
    tags: input.tags,
    ...(input.comment ? { comment: input.comment } : {}),
    // A recast is already done; there's nothing more for the storyteller unless the player said more.
    tellStoryteller: input.tellStoryteller && !!(input.rating || input.tags.length || (input.comment && !input.recast)),
    createdAt: new Date().toISOString(),
  };
  await stores.feedback.add(record);
  return { save, ...(recast ? { recast } : {}) };
}

/** How one feedback item reads to the storyteller. Player text is sanitized like any other input. */
export function describeFeedback(f: FeedbackRecord, save: SaveFile): string {
  const npcName = (id?: string) => (id ? save.npcs.find((n) => n.id === id)?.name ?? id : undefined);
  const about =
    f.target.type === "storyteller"
      ? "your storytelling in general"
      : f.target.type === "game"
        ? "the game in general"
        : f.target.type === "voice"
          ? `the voice of ${npcName(f.target.npcId)} (${voiceLabel(save.npcs.find((n) => n.id === f.target.npcId)?.voiceId, save.generatedVoices) ?? "no voice"})`
          : f.target.type === "character"
            ? `the character ${npcName(f.target.npcId)}`
            : f.target.speaker && f.target.speaker !== NARRATOR
              ? `a line by ${npcName(f.target.speaker)}`
              : "a line of your narration";
  const parts = [`About ${about}`];
  if (f.target.text) parts.push(`(the line: "${sanitizePlayerText(f.target.text, 200)}")`);
  if (f.rating) parts.push(f.rating === "up" ? "the player liked it" : "the player didn't like it");
  if (f.tags.length) parts.push(`tags: ${f.tags.map((t) => FEEDBACK_TAGS.find((x) => x.id === t)?.label.toLowerCase() ?? t).join(", ")}`);
  if (f.comment) parts.push(`comment: "${sanitizePlayerText(f.comment, 500)}"`);
  return `- ${parts.join("; ")}`;
}

export function feedbackBlock(items: FeedbackRecord[], save: SaveFile): string {
  return `<player_feedback>\n${items.map((f) => describeFeedback(f, save)).join("\n")}\n</player_feedback>`;
}
