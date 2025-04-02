import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";

import { connectToDB } from "@/lib/mongoDB";
import Character from "@/lib/models/Character";

export const POST = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId, name, classRole, keyAttributes, resources, notableAbilities, equipment, characterGoals } = await req.json();
    
    if (!sessionId) return new NextResponse("Missing session ID", { status: 400 });
    
    await connectToDB();
    const newCharacter = await Character.create({
      sessionId,
      name,
      classRole,
      keyAttributes,
      resources,
      notableAbilities,
      equipment,
      characterGoals,
    });

    return NextResponse.json(newCharacter, { status: 201 });
  } catch (err) {
    console.log("[characters_POST]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const PUT = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId, name, classRole, keyAttributes, resources, notableAbilities, equipment, characterGoals } = await req.json();

    if (!sessionId) return new NextResponse("Missing character ID", { status: 400 });

    const updatedCharacter = await Character.findOneAndUpdate(
      { sessionId: sessionId },
      { name, classRole, keyAttributes, resources, notableAbilities, equipment, characterGoals },
      { new: true }
    );

    return NextResponse.json(updatedCharacter, { status: 200 });
  } catch (err) {
    console.log("[characters_PUT]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
}; 

export const GET = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId } = await req.json();
    if (!sessionId) return new NextResponse("Missing session ID", { status: 400 });

    await connectToDB();
    const characters = await Character.find({ sessionId: sessionId });
    return NextResponse.json(characters, { status: 200 });
  } catch (err) {
    console.log("[characters_GET]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const DELETE = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await req.json();
    if (!id) return new NextResponse("Missing character ID", { status: 400 });

    await connectToDB();
    await Character.deleteOne({ _id: id});

    return new NextResponse("Character deleted successfully", { status: 200 });
  } catch (err) {
    console.log("[characters_DELETE]", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

export const dynamic = "force-dynamic";