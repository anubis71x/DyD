import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { commitEvents, loadCampaign } from "@/lib/save/service";
import type { SaveEvent } from "@/lib/save/schema";
import { MODEL_IDS } from "@/lib/storyteller/models";
import { REPLY_LENGTHS } from "@/lib/storyteller/replyLength";
import { sessionLines } from "@/lib/storyteller/recap";

export const dynamic = "force-dynamic";

type Ctx = { params: { campaignId: string } };

/** The save file plus the current session's visible transcript. */
export const GET = handle("campaign_GET", async (_req: Request, { params }: Ctx) => {
  const userId = requireUser();
  const stores = await getMongoStores();
  const [save, session, balanceMicros] = await Promise.all([
    loadCampaign(stores, userId, params.campaignId),
    stores.sessions.latest(userId, params.campaignId),
    stores.wallet.balance(userId),
  ]);
  const active = session && !session.endedAt ? session : null;
  return NextResponse.json({
    save,
    balanceMicros,
    sessionNo: active?.sessionNo ?? null,
    transcript: active ? sessionLines(active) : [],
  });
});

export const DELETE = handle("campaign_DELETE", async (_req: Request, { params }: Ctx) => {
  const userId = requireUser();
  const stores = await getMongoStores();
  if (!(await stores.campaigns.remove(userId, params.campaignId))) throw new HttpError(404, "Campaign not found");
  return new NextResponse(null, { status: 204 });
});

const PatchBody = z
  .object({ modelId: z.enum(MODEL_IDS).optional(), replyLength: z.enum(REPLY_LENGTHS).optional() })
  .refine((b) => b.modelId || b.replyLength);

/** Change campaign settings: which model the storyteller runs on, and how long its replies are. */
export const PATCH = handle("campaign_PATCH", async (req: NextRequest, { params }: Ctx) => {
  const userId = requireUser();
  const body = PatchBody.safeParse(await req.json().catch(() => null));
  if (!body.success) throw new HttpError(400, "Choose one of the available models or reply lengths.");
  const events: SaveEvent[] = [];
  if (body.data.modelId) events.push({ type: "campaign.model", modelId: body.data.modelId });
  if (body.data.replyLength) events.push({ type: "preferences.update", patch: { replyLength: body.data.replyLength } });
  const save = await commitEvents(await getMongoStores(), userId, params.campaignId, events, "user");
  return NextResponse.json({ save });
});
