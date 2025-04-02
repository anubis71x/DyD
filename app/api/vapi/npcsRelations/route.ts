import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import NpcsRelations from "@/lib/models/NpcsRelations";
import { convertToCamelCase } from "@/lib/utils";

/** 📌 Definir la interfaz para los NPCs */
interface Npc {
  name: string;
  description?: string;
  relationship: "friendly" | "neutral" | "hostile";
  lastInteraction?: string;
  motivations?: string;
  dialogues?: string[];
}

/** 📌 Agregar nuevos NPCs a la sesión */
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const camelCaseBody = convertToCamelCase(body);

    const toolCall = camelCaseBody.message.toolCalls.find(
      (call: any) => call.function.name === "updateNpcsRelationsData"
    );

    if (!toolCall) {
      return NextResponse.json({
        results: [
          {
            toolCallId: "unknown",
            result: "Tool call not found"
          }
        ]
      }, { status: 400 });
    }

    const args = toolCall.function.arguments;
    const { sessionId, npcs }: { sessionId: string; npcs: Npc[] } = args;

    if (!sessionId || !npcs) {
      return NextResponse.json({
        results: [
          {
            toolCallId: toolCall.id,
            result: "Missing sessionId or npcs"
          }
        ]
      }, { status: 400 });
    }

    await connectToDB();

    const existingRecord = await NpcsRelations.findOne({ sessionId });

    if (existingRecord) {
      const updatedNpcs = existingRecord.toObject().npcs.map((existingNpc: Npc) => {
        const updatedNpc = npcs.find(npc => npc.name === existingNpc.name);
        return updatedNpc ? { ...existingNpc, ...updatedNpc } : existingNpc;
      });

      const newNpcs = npcs.filter(npc => !existingRecord.toObject().npcs.some((existingNpc: Npc) => existingNpc.name === npc.name));

      const mergedNpcs = [
        ...updatedNpcs,
        ...newNpcs
      ];

      const result = await NpcsRelations.findOneAndUpdate(
        { sessionId },
        { $set: { npcs: mergedNpcs } },
        { new: true }
      );

      console.log("✅ NPCs actualizados:", result);
      return NextResponse.json({
        results: [
          {
            toolCallId: toolCall.id,
            result: "NPCs updated successfully"
          }
        ]
      }, { status: 200 });
    }

    const newRecord = await NpcsRelations.create({
      sessionId,
      npcs
    });

    console.log("✅ Nuevo NpcsRelations creado:", newRecord);
    return NextResponse.json({
      results: [
        {
          toolCallId: toolCall.id,
          result: "New NpcsRelations created successfully"
        }
      ]
    }, { status: 201 });

  } catch (err) {
    console.error("[npcsRelations_POST] Error:", err);
    return NextResponse.json({
      results: [
        {
          toolCallId: "unknown",
          result: "Internal Error"
        }
      ]
    }, { status: 500 });
  }
};
