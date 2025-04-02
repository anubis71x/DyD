import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDB } from "@/lib/mongoDB";
import NpcsRelations from "@/lib/models/NpcsRelations";

/** 📌 Definir la interfaz para los NPCs */
interface Npc {
  name: string;
  description?: string;
  relationship: "friendly" | "neutral" | "hostile";
  lastInteraction?: string;
  motivations?: string;
  dialogues?: string[];
}

/** 📌 Obtener la lista de NPCs de una sesión */
export const GET = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 400 });

    const { sessionId } = await req.json();
    if (!sessionId) return new NextResponse("Missing session ID", { status: 400 });
    
    console.log("🔍 Fetching NPCs for sessionId:", sessionId);
    
    await connectToDB();
    const npcsData = await NpcsRelations.findOne({ sessionId });

    return NextResponse.json(npcsData || { sessionId, npcs: [] }, { status: 200 });
  } catch (err) {
    console.error("[npcsRelations_GET] Error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

/** 📌 Agregar nuevos NPCs a la sesión */
export const POST = async (req: NextRequest) => {
  try {
    let { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });
    
    const { sessionId, npcs }: { sessionId: string; npcs: Npc[];} = await req.json();
    
    if (!sessionId || !npcs || !Array.isArray(npcs)) {
      return new NextResponse("Missing or invalid sessionId or npcs data", { status: 400 });
    }
    
    await connectToDB();
    const existingRecord = await NpcsRelations.findOne({ sessionId });

    if (existingRecord) {
      // 🚀 Evitar duplicados al agregar nuevos NPCs
      const newNpcs = npcs.filter(npc => !existingRecord.npcs.some((existingNpc: Npc) => existingNpc.name === npc.name));
      existingRecord.npcs.push(...newNpcs);
      await existingRecord.save();
      return NextResponse.json(existingRecord, { status: 200 });
    } else {
      const newRecord = await NpcsRelations.create({ sessionId, npcs });
      return NextResponse.json(newRecord, { status: 201 });
    }
  } catch (err) {
    console.error("[npcsRelations_POST] Error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

/** 📌 Actualizar la lista de NPCs de una sesión */
export const PUT = async (req: NextRequest) => {
  try {
    const { userId } = auth(); 
    if (!userId) return new NextResponse("Unauthorized", { status: 400 });
    
    const { sessionId, updatedNpcs }: { sessionId: string; updatedNpcs: Npc[]; } = await req.json();
    
    if (!sessionId || !updatedNpcs || !Array.isArray(updatedNpcs)) {
      return new NextResponse("Missing or invalid sessionId or updatedNpcs data", { status: 400 });
    }
    
    await connectToDB();
    const existingRecord = await NpcsRelations.findOne({ sessionId});

    if (!existingRecord) {
      return new NextResponse("Session NPCs not found", { status: 404 });
    }

    existingRecord.npcs = updatedNpcs;
    await existingRecord.save();

    return NextResponse.json(existingRecord, { status: 200 });
  } catch (err) {
    console.error("[npcsRelations_PUT] Error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};

/** 📌 Eliminar un NPC específico de la sesión */
export const DELETE = async (req: NextRequest) => {
  try {
    const { userId } = auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 400 });

    await connectToDB();

    const { sessionId, npcName }: { sessionId: string; npcName: string } = await req.json();

    if (!sessionId || !npcName) {
      return new NextResponse("Missing sessionId or npcName", { status: 400 });
    }

    const existingRecord = await NpcsRelations.findOne({ sessionId, clerkId: userId });

    if (!existingRecord) {
      return new NextResponse("Session NPCs not found", { status: 404 });
    }

    // 🚀 Especificar el tipo `Npc` en `filter()`
    existingRecord.npcs = existingRecord.npcs.filter((npc: Npc) => npc.name !== npcName);
    await existingRecord.save();

    return NextResponse.json(existingRecord, { status: 200 });
  } catch (err) {
    console.error("[npcsRelations_DELETE] Error:", err);
    return new NextResponse("Internal Error", { status: 500 });
  }
};
