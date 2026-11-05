import { NextResponse } from "next/server";
import { handle, HttpError, requireUser } from "@/lib/api/http";
import { getMongoStores } from "@/lib/save/mongoStore";
import { loadCampaign } from "@/lib/save/service";
import { acquireCampaignLock, campaignLockKey, getClient } from "@/lib/storyteller/client";
import { endSession } from "@/lib/storyteller/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

/** End the current session and write its recap. Returns the updated save. */
export const POST = handle("session_end_POST", async (_req: Request, { params }: { params: { campaignId: string } }) => {
  const userId = requireUser();
  const stores = await getMongoStores();
  await loadCampaign(stores, userId, params.campaignId);
  const key = campaignLockKey(userId, params.campaignId);
  const lock = await acquireCampaignLock(stores.locks, key);
  if (!lock) throw new HttpError(409, "Wait for the storyteller to finish before ending the session.");
  try {
    const ended = await endSession(userId, params.campaignId, { stores, client: getClient(), emit: () => {} });
    const [save, balanceMicros] = await Promise.all([loadCampaign(stores, userId, params.campaignId), stores.wallet.balance(userId)]);
    return NextResponse.json({ ended, save, balanceMicros });
  } finally {
    await stores.locks.release(key, lock);
  }
});
