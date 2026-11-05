import { NextResponse } from "next/server";
import { getMongoStores } from "@/lib/save/mongoStore";
import { getClient } from "@/lib/storyteller/client";
import { closeIdleSessions } from "@/lib/storyteller/maintenance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel Hobby allows at most 60 s (Next needs a literal here). On a plan with longer limits this can be raised.
export const maxDuration = 60;

/**
 * Scheduled job: close sessions idle for 6+ hours with a journal recap.
 * Public in middleware.ts but requires `Authorization: Bearer <CRON_SECRET>`
 * (the header Vercel Cron sends). Call it every 30-60 minutes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // A few seconds per recap: 10 per run fits in 60 s. Remaining sessions are picked up next run.
  const result = await closeIdleSessions(await getMongoStores(), getClient(), { limit: 10 });
  return NextResponse.json(result);
}
