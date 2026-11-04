import { NextResponse } from "next/server";
import { handle, HttpError, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { loadCampaign } from "@/lib/save/service";
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
