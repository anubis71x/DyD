import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin";
import { getMongoStores } from "@/lib/save/mongoStore";

export const dynamic = "force-dynamic";

/** Admin: the most recent player feedback. ?rating=up|down filters. */
export async function GET(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  const rating = new URL(req.url).searchParams.get("rating");
  const stores = await getMongoStores();
  const items = await stores.feedback.recent(200, rating === "up" || rating === "down" ? { rating } : undefined);
  return NextResponse.json(items);
}
