import { NextResponse } from "next/server";
import { getMongoStores } from "@/lib/save/mongoStore";
import { getClient } from "@/lib/storyteller/client";
import { closeIdleSessions } from "@/lib/storyteller/maintenance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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
  const result = await closeIdleSessions(await getMongoStores(), getClient());
  return NextResponse.json(result);
}
