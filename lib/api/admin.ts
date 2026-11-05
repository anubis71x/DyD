import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import Admin from "@/lib/models/admin";
import { connectToDB } from "@/lib/mongoDB";

/**
 * Admins: Clerk user ids listed in ADMIN_USER_IDS (comma-separated; this is
 * how the first admin is set up), plus users with an `isAdmin: true` record in
 * the admins collection.
 */
const envAdmins = () =>
  new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

export async function isAdminUser(userId: string): Promise<boolean> {
  if (envAdmins().has(userId)) return true;
  await connectToDB();
  return !!(await Admin.exists({ userId, isAdmin: true }));
}

/**
 * Put first in an admin-only route handler:
 *   const denied = await adminGuard(); if (denied) return denied;
 */
export async function adminGuard(): Promise<NextResponse | null> {
  const { userId } = auth();
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await isAdminUser(userId))) return new NextResponse("Forbidden", { status: 403 });
  return null;
}
