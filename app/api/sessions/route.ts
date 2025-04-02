import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import Session from "@/lib/models/Session";

export const POST = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await connectToDB();
    const { campaign } = await req.json();

    // ✅ Crear solo la sesión sin inicializar otros modelos
    const newSession = await Session.create({
      uId: userId,
      campaign
    });

    return NextResponse.json({ sessionId: newSession._id, message: "Session created successfully" }, { status: 201 });

  } catch (err) {
    console.log("[sessions_POST]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const PUT = async (req: NextRequest) => {
  try {
    const { userId,} = await auth();
    const body = await req.json();
    
    const { sessionId, campaign, duration } = body;

    if (!sessionId || !userId) {
      return new NextResponse("Missing sessionId or userId", { status: 400 });
    }
    
    await connectToDB();
    const updatedSession = await Session.findOneAndUpdate(
      { _id: sessionId, uId: userId },{
      ...(campaign && { campaign }),
      ...(duration && { duration }) 
      },
      { new: true }
    );

    return NextResponse.json(updatedSession, { status: 200 });
  } catch (err) {
    console.log("[sessions_PUT]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const GET = async () => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await connectToDB();
    const sessions = await Session.find({ uId: userId }).sort({ createdAt: "desc" });

    return NextResponse.json(sessions, { status: 200 });
  } catch (err) {
    console.log("[sessions_GET]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const DELETE = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await req.json();
    if (!id) return new NextResponse("Missing session ID", { status: 400 });

    await connectToDB();
    await Session.deleteOne({ _id: id, uId: userId });

    return new NextResponse("Session deleted successfully", { status: 200 });
  } catch (err) {
    console.log("[sessions_DELETE]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const dynamic = "force-dynamic";
