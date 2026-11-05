import { NextRequest, NextResponse } from "next/server";
import { handle, HttpError, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { FeedbackError, FeedbackInput, submitFeedback } from "@/lib/storyteller/feedback";

export const dynamic = "force-dynamic";

/**
 * Send feedback on a line, character, voice, the storyteller or the game.
 * Deliberately doesn't take the campaign lock: it works while a turn is in
 * progress and never interrupts it.
 */
export const POST = handle("feedback_POST", async (req: NextRequest, { params }: { params: { campaignId: string } }) => {
  const userId = requireUser();
  const parsed = FeedbackInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "That feedback couldn't be read.");
  try {
    const result = await submitFeedback(await getMongoStores(), userId, params.campaignId, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof FeedbackError) throw new HttpError(400, err.message);
    throw err;
  }
});
