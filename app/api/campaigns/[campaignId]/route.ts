import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handle, HttpError, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { commitEvents, loadCampaign } from "@/lib/save/service";
import { MODEL_IDS } from "@/lib/storyteller/models";
import { transcriptFromMessages } from "@/lib/storyteller/transcript";

export const dynamic = "force-dynamic";

type Ctx = { params: { campaignId: string } };

/** The save file plus the current session's visible transcript. */
export const GET = handle("campaign_GET", async (_req: Request, { params }: Ctx) => {
  const userId = requireUser();
  const stores = await getMongoStores();
  const [save, session, coins] = await Promise.all([
    loadCampaign(stores, userId, params.campaignId),
    stores.sessions.latest(userId, params.campaignId),
    stores.wallet.balance(userId),
  ]);
  const active = session && !session.endedAt ? session : null;
  return NextResponse.json({
    save,
    coins,
    sessionNo: active?.sessionNo ?? null,
    transcript: active ? transcriptFromMessages(active.messages) : [],
  });
});

export const DELETE = handle("campaign_DELETE", async (_req: Request, { params }: Ctx) => {
  const userId = requireUser();
  const stores = await getMongoStores();
  if (!(await stores.campaigns.remove(userId, params.campaignId))) throw new HttpError(404, "Campaign not found");
  return new NextResponse(null, { status: 204 });
});

const PatchBody = z.object({ modelId: z.enum(MODEL_IDS) });

/** Change campaign settings. Currently: which model the storyteller runs on. */
export const PATCH = handle("campaign_PATCH", async (req: NextRequest, { params }: Ctx) => {
  const userId = requireUser();
  const body = PatchBody.safeParse(await req.json().catch(() => null));
  if (!body.success) throw new HttpError(400, "Choose one of the available models.");
  const save = await commitEvents(await getMongoStores(), userId, params.campaignId, [{ type: "campaign.model", modelId: body.data.modelId }], "user");
  return NextResponse.json({ save });
});
