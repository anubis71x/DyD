import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import Quest from "@/lib/models/Quest";
import mongoose from "mongoose";

/** 📌 Definir la interfaz QuestItem */
interface QuestItem {
  title: string;
  description?: string;
  status: "active" | "completed" | "failed";
  relatedNPCs: string[];
  objectives: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

/** 📌 Agregar nuevas misiones a una sesión */
export const POST = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId, quests }: { sessionId: string; quests: QuestItem[]; } = await req.json();
    if (!sessionId) return new NextResponse("Unauthorized", { status: 401 });
    
    await connectToDB();
    const existingRecord = await Quest.findOne({ sessionId });

    if (existingRecord) {
      // 🚀 Evitar duplicados al agregar nuevas misiones
      const newQuests = quests.filter(
        (quest) => !existingRecord.quests.some((existingQuest: QuestItem) => existingQuest.title === quest.title)
      );
      existingRecord.quests.push(...newQuests);
      await existingRecord.save();
      return NextResponse.json(existingRecord, { status: 200 });
    } else {
      const newRecord = await Quest.create({ sessionId, quests });
      return NextResponse.json(newRecord, { status: 201 });
    }
  } catch (err) {
    console.error("[quests_POST] Error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

/** 📌 Actualizar una misión específica dentro de una sesión */
export const PUT = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId, updatedQuest }: { sessionId: string; updatedQuest: QuestItem; } = await req.json();
    if (!sessionId) return new NextResponse("Unauthorized", { status: 401 });

    await connectToDB();
    const existingRecord = await Quest.findOne({ sessionId });

    if (!existingRecord) {
      return new NextResponse("Session quests not found", { status: 404 });
    }

    // ✅ Especificar el tipo `QuestItem` en `map()`
    existingRecord.quests = existingRecord.quests.map((quest: QuestItem) =>
      quest.title === updatedQuest.title ? updatedQuest : quest
    );

    await existingRecord.save();

    return NextResponse.json(existingRecord, { status: 200 });
  } catch (err) {
    console.error("[quests_PUT] Error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

/** 📌 Obtener todas las misiones de una sesión */
export const GET = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId } = await req.json();
    if ( !sessionId ) {return new NextResponse("Invalid sessionId format", { status: 400 });}
    
    console.log("🔍 Fetching quests for sessionId:", sessionId);
    
    // ✅ Buscar todas las misiones de la sesión
    await connectToDB();
    const questsData = await Quest.findOne({ sessionId });

    return NextResponse.json(questsData || { sessionId, quests: [] }, { status: 200 });
  } catch (err) {
    console.error("[quests_GET] Error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

/** 📌 Eliminar una misión específica de una sesión */
export const DELETE = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    const { sessionId, questTitle } = await req.json();
    if (!sessionId || !questTitle) { return new NextResponse("Missing sessionId or questTitle", { status: 400 }); }
    
    await connectToDB();
    const existingRecord = await Quest.findOne({ sessionId });

    if (!existingRecord) {
      return new NextResponse("Session quests not found", { status: 404 });
    }

    // ✅ Especificar el tipo `QuestItem` en `filter()`
    existingRecord.quests = existingRecord.quests.filter((q: QuestItem) => q.title !== questTitle);
    await existingRecord.save();

    return new NextResponse("Quest deleted successfully", { status: 200 });
  } catch (err) {
    console.error("[quests_DELETE] Error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};