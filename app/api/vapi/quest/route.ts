import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import Quest from "@/lib/models/Quest";
import { convertToCamelCase } from "@/lib/utils";

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

/** 📌 Agregar o actualizar misiones en una sesión */
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const camelCaseBody = convertToCamelCase(body);

    const toolCall = camelCaseBody.message.toolCalls.find(
      (call: any) => call.function.name === "updateQuestData"
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
    const { sessionId, quests }: { sessionId: string; quests: QuestItem[] } = args;

    if (!sessionId || !quests || !Array.isArray(quests)) {
      return NextResponse.json({
        results: [
          {
            toolCallId: toolCall.id,
            result: "Missing or invalid sessionId or quests data"
          }
        ]
      }, { status: 400 });
    }

    await connectToDB();

    const existingRecord = await Quest.findOne({ sessionId });

    if (existingRecord) {
      const updatedQuests = existingRecord.toObject().quests.map((existingQuest: QuestItem) => {
        const updatedQuest = quests.find(quest => quest.title === existingQuest.title);
        return updatedQuest ? { ...existingQuest, ...updatedQuest } : existingQuest;
      });

      const newQuests = quests.filter(quest =>
        !existingRecord.toObject().quests.some((existingQuest: QuestItem) => existingQuest.title === quest.title)
      );

      const mergedQuests = [
        ...updatedQuests,
        ...newQuests
      ];

      const result = await Quest.findOneAndUpdate(
        { sessionId },
        { $set: { quests: mergedQuests } },
        { new: true }
      );

      console.log("✅ Misiones actualizadas:", result);
      return NextResponse.json({
        results: [
          {
            toolCallId: toolCall.id,
            result: "Quests updated successfully"
          }
        ]
      }, { status: 200 });
    }

    const newRecord = await Quest.create({
      sessionId,
      quests
    });

    console.log("✅ Nuevas misiones creadas:", newRecord);
    return NextResponse.json({
      results: [
        {
          toolCallId: toolCall.id,
          result: "New quests created successfully"
        }
      ]
    }, { status: 201 });

  } catch (err) {
    console.error("[quests_POST] Error:", err);
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
