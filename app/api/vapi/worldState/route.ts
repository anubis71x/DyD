import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import WorldState from "@/lib/models/WorldState";
import { convertToCamelCase } from "@/lib/utils";

/** 📌 Agregar o actualizar el estado del mundo en una sesión */
export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const camelCaseBody = convertToCamelCase(body);

    const toolCall = camelCaseBody.message.toolCalls.find(
      (call: any) => call.function.name === "updateWorldStateData"
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
    const { sessionId, worldState } = args;

    if (!sessionId || !worldState) {
      return NextResponse.json({
        results: [
          {
            toolCallId: toolCall.id,
            result: "Missing sessionId or worldState"
          }
        ]
      }, { status: 400 });
    }

    const {
      locationsVisited = [],
      newLocationsDiscovered = [],
      factionChanges = [],
      environmentalChanges = [],
      timeProgression = ""
    } = worldState;

    await connectToDB();

    const existingWorldState = await WorldState.findOne({ sessionId });

    if (existingWorldState) {
      const mergedWorldState = {
        ...existingWorldState.toObject(),
        locationsVisited: [
          ...new Set([
            ...existingWorldState.toObject().locationsVisited,
            ...locationsVisited
          ])
        ],
        newLocationsDiscovered: [
          ...new Set([
            ...existingWorldState.toObject().newLocationsDiscovered,
            ...newLocationsDiscovered
          ])
        ],
        factionChanges: [
          ...new Set([
            ...existingWorldState.toObject().factionChanges,
            ...factionChanges
          ])
        ],
        environmentalChanges: [
          ...new Set([
            ...existingWorldState.toObject().environmentalChanges,
            ...environmentalChanges
          ])
        ],
        timeProgression: timeProgression || existingWorldState.timeProgression
      };

      const updatedWorldState = await WorldState.findOneAndUpdate(
        { sessionId },
        { $set: mergedWorldState },
        { new: true }
      );

      console.log("✅ WorldState actualizado:", updatedWorldState);
      return NextResponse.json({
        results: [
          {
            toolCallId: toolCall.id,
            result: "WorldState updated successfully"
          }
        ]
      }, { status: 200 });
    }

    const newWorldState = await WorldState.create({
      sessionId,
      locationsVisited,
      newLocationsDiscovered,
      factionChanges,
      environmentalChanges,
      timeProgression
    });

    console.log("✅ Nuevo WorldState creado:", newWorldState);
    return NextResponse.json({
      results: [
        {
          toolCallId: toolCall.id,
          result: "New WorldState created successfully"
        }
      ]
    }, { status: 201 });

  } catch (err) {
    console.log("[worldstate_POST]", err);
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
