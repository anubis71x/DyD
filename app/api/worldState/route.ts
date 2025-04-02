import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import WorldState from "@/lib/models/WorldState";

export const POST = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    
    const { sessionId, locationsVisited, newLocationsDiscovered, factionChanges, environmentalChanges, timeProgression } = await req.json();
    if (!sessionId) return new NextResponse("Missing sessionId", { status: 400 });
    
    await connectToDB();
    const newWorldState = await WorldState.create({
      sessionId,
      locationsVisited,
      newLocationsDiscovered,
      factionChanges,
      environmentalChanges,
      timeProgression,
    });

    return NextResponse.json(newWorldState, { status: 201 });
  } catch (err) {
    console.log("[worldstate_POST]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const PUT = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    
    const { id, locationsVisited, newLocationsDiscovered, factionChanges, environmentalChanges, timeProgression } = await req.json();
    
    if (!id) return new NextResponse("Missing world state ID", { status: 400 });
    
    await connectToDB();
    const updatedWorldState = await WorldState.findOneAndUpdate(
      { _id: id },
      { locationsVisited, newLocationsDiscovered, factionChanges, environmentalChanges, timeProgression },
      { new: true }
    );

    return NextResponse.json(updatedWorldState, { status: 200 });
  } catch (err) {
    console.log("[worldstate_PUT]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};  

export const GET = async () => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await connectToDB();
    const worldState = await WorldState.find({ uId: userId });
    return NextResponse.json(worldState, { status: 200 });
  } catch (err) {
    console.log("[worldstate_GET]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const DELETE = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await req.json();
    if (!id) return new NextResponse("Missing world state ID", { status: 400 });

    await connectToDB();
    await WorldState.deleteOne({ _id: id, uId: userId });

    return new NextResponse("World state deleted successfully", { status: 200 });
  } catch (err) {
    console.log("[worldstate_DELETE]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const dynamic = "force-dynamic";
