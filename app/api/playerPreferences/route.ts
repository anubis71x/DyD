import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import PlayerPreferences from "@/lib/models/PlayerPreferences";

export const POST = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId, gameStyle, toneAtmosphere, contentBoundaries, pacingPreferences, interactionStyle } = await req.json();

    await connectToDB();

    const newPreferences = await PlayerPreferences.create({
      sessionId,
      gameStyle,
      toneAtmosphere,
      contentBoundaries,
      pacingPreferences,
      interactionStyle,
    });

    return NextResponse.json(newPreferences, { status: 201 });
  } catch (err) {
    console.log("[playerpreferences_POST]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const GET = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId } = await req.json();

    await connectToDB();
    const preferences = await PlayerPreferences.find({ sessionId: sessionId });
    return NextResponse.json(preferences, { status: 200 });
  } catch (err) {
    console.log("[playerpreferences_GET]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const DELETE = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await req.json();
    if (!id) return new NextResponse("Missing preferences ID", { status: 400 });

    await connectToDB();
    await PlayerPreferences.deleteOne({ _id: id });

    return new NextResponse("Player preferences deleted successfully", { status: 200 });
  } catch (err) {
    console.log("[playerpreferences_DELETE]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const PUT = async (req: NextRequest) => {
    try {
      const { userId } = auth();
      if (!userId) return new NextResponse("Unauthorized", { status: 401 });
      
      const { id, gameStyle, toneAtmosphere, contentBoundaries, pacingPreferences, interactionStyle } = await req.json();
      if (!id) return new NextResponse("Missing player preferences ID", { status: 400 });
      
      await connectToDB();
      
      const updatedPreferences = await PlayerPreferences.findOneAndUpdate(
        { _id: id },
        { gameStyle, toneAtmosphere, contentBoundaries, pacingPreferences, interactionStyle },
        { new: true }
      );
  
      return NextResponse.json(updatedPreferences, { status: 200 });
    } catch (err) {
      console.log("[playerpreferences_PUT]", err);
      return new NextResponse("Internal Error", { status: 500 });
    }
  };
  
export const dynamic = "force-dynamic";
