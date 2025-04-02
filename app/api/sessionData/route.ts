import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDB } from "@/lib/mongoDB";
import Session from "@/lib/models/Session";
import Character from "@/lib/models/Character";
import MechanicsTracking from "@/lib/models/MechanicsTracking";
import NpcsRelations from "@/lib/models/NpcsRelations";
import Quest from "@/lib/models/Quest";
import WorldState from "@/lib/models/WorldState";
import PlayerPreferences from "@/lib/models/PlayerPreferences";

export const GET = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await connectToDB();

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    // 🚀 Validar que `sessionId` sea un ObjectId válido antes de consultar MongoDB
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      console.log("❌ Invalid sessionId:", sessionId);
      return new NextResponse("Invalid sessionId format", { status: 400 });
    }

    console.log("🔍 Fetching session data for sessionId:", sessionId);

    const session = await Session.findOne({ _id: sessionId, userId: userId });
    if (!session) {
      console.log("❌ Session not found for sessionId:", sessionId);
      return new NextResponse("Session not found", { status: 404 });
    }

    // 🚀 Obtener datos relacionados con la sesión en paralelo
    const [character, mechanicsTracking, npcsRelations, quests, worldState, playerPreferences] = await Promise.all([
      Character.findOne({ sessionId, userId: userId }),
      MechanicsTracking.findOne({ sessionId, userId: userId }),
      NpcsRelations.findOne({ sessionId, userId: userId }),
      Quest.findOne({ sessionId, userId: userId }),
      WorldState.findOne({ sessionId, userId: userId }),
      PlayerPreferences.findOne({ sessionId, userId: userId })
    ]);

    console.log("✅ Session data retrieved successfully for sessionId:", sessionId);

    return NextResponse.json({
      sessionId,
      session,
      character,
      mechanicsTracking,
      npcsRelations,
      quests,
      worldState,
      playerPreferences
    }, { status: 200 });

  } catch (err) {
    console.error("[session-data_GET] Internal Error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};
