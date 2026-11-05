import { auth } from "@clerk/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { adminGuard, isAdminUser } from "@/lib/api/admin";
import Admin from "@/lib/models/admin";
import { connectToDB } from "@/lib/mongoDB";

export const dynamic = "force-dynamic";

/**
 * GET ?me=1  → { isAdmin } for the signed-in user (any user may ask about themselves).
 * GET        → list of admin records (admins only).
 * POST/PUT/DELETE manage admin records (admins only). An admin can't remove
 * their own admin rights, so nobody locks themselves out by accident.
 */
export const GET = async (req: NextRequest) => {
  try {
    if (new URL(req.url).searchParams.get("me")) {
      const { userId } = auth();
      if (!userId) return new NextResponse("Unauthorized", { status: 401 });
      return NextResponse.json({ isAdmin: await isAdminUser(userId) });
    }
    const denied = await adminGuard();
    if (denied) return denied;
    await connectToDB();
    return NextResponse.json(await Admin.find().lean(), { status: 200 });
  } catch (err) {
    console.log("[admin_GET]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

async function readTarget(req: NextRequest): Promise<{ userId: string; isAdmin?: boolean } | NextResponse> {
  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!userId) return new NextResponse("Missing userId", { status: 400 });
  return { userId, ...(typeof body.isAdmin === "boolean" ? { isAdmin: body.isAdmin } : {}) };
}

const isSelf = (userId: string) => auth().userId === userId;

export const POST = async (req: NextRequest) => {
  try {
    const denied = await adminGuard();
    if (denied) return denied;
    const target = await readTarget(req);
    if (target instanceof NextResponse) return target;
    await connectToDB();
    if (await Admin.exists({ userId: target.userId })) return new NextResponse("Admin already exists", { status: 400 });
    const admin = await Admin.create({ userId: target.userId, isAdmin: target.isAdmin ?? false });
    return NextResponse.json(admin, { status: 201 });
  } catch (err) {
    console.log("[admin_POST]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const PUT = async (req: NextRequest) => {
  try {
    const denied = await adminGuard();
    if (denied) return denied;
    const target = await readTarget(req);
    if (target instanceof NextResponse) return target;
    if (isSelf(target.userId) && target.isAdmin === false) return new NextResponse("You can't remove your own admin rights", { status: 400 });
    await connectToDB();
    const updated = await Admin.findOneAndUpdate(
      { userId: target.userId },
      { ...(target.isAdmin !== undefined && { isAdmin: target.isAdmin }), updatedAt: new Date() },
      { new: true },
    );
    if (!updated) return new NextResponse("Admin not found", { status: 404 });
    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.log("[admin_PUT]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const DELETE = async (req: NextRequest) => {
  try {
    const denied = await adminGuard();
    if (denied) return denied;
    const target = await readTarget(req);
    if (target instanceof NextResponse) return target;
    if (isSelf(target.userId)) return new NextResponse("You can't remove your own admin rights", { status: 400 });
    await connectToDB();
    const deleted = await Admin.findOneAndDelete({ userId: target.userId });
    if (!deleted) return new NextResponse("Admin not found", { status: 404 });
    return NextResponse.json({ message: "Admin deleted" }, { status: 200 });
  } catch (err) {
    console.log("[admin_DELETE]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};
