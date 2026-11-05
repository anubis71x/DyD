import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/api/admin";
import { monthlyReport } from "@/lib/billing/report";

export const dynamic = "force-dynamic";

/** Admin: billing report for ?month=YYYY-MM (default: current month, UTC). */
export async function GET(req: NextRequest) {
  const denied = await adminGuard();
  if (denied) return denied;
  const month = new URL(req.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  try {
    return NextResponse.json(await monthlyReport(month));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
