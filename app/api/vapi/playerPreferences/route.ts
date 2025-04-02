import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import PlayerPreferences from "@/lib/models/PlayerPreferences";
import { convertToCamelCase } from "@/lib/utils";

export const POST = async (req: NextRequest) => {
    try {
        const body = await req.json();
        const camelCaseBody = convertToCamelCase(body);

        const toolCall = camelCaseBody.message.toolCalls.find(
            (call: any) => call.function.name === "updatePlayerPreferencesData"
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
        const { sessionId, playerPreferences } = args;

        if (!sessionId || !playerPreferences) {
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "Missing sessionId or playerPreferences"
                    }
                ]
            }, { status: 400 });
        }

        const {
            gameStyle = "",
            toneAtmosphere = "",
            contentBoundaries = [],
            pacingPreferences = "",
            interactionStyle = ""
        } = playerPreferences;

        await connectToDB();

        const existingPreferences = await PlayerPreferences.findOne({ sessionId });

        if (existingPreferences) {
            const mergedPreferences = {
                ...existingPreferences.toObject(),
                gameStyle: gameStyle || existingPreferences.gameStyle,
                toneAtmosphere: toneAtmosphere || existingPreferences.toneAtmosphere,
                contentBoundaries: [
                    ...new Set([
                        ...existingPreferences.toObject().contentBoundaries,
                        ...contentBoundaries
                    ])
                ],
                pacingPreferences: pacingPreferences || existingPreferences.pacingPreferences,
                interactionStyle: interactionStyle || existingPreferences.interactionStyle
            };

            const updatedPreferences = await PlayerPreferences.findOneAndUpdate(
                { sessionId },
                { $set: mergedPreferences },
                { new: true }
            );

            console.log("✅ Preferencias actualizadas:", updatedPreferences);
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "Player preferences updated successfully"
                    }
                ]
            }, { status: 200 });
        }

        const newPreferences = await PlayerPreferences.create({
            sessionId,
            gameStyle,
            toneAtmosphere,
            contentBoundaries,
            pacingPreferences,
            interactionStyle
        });

        console.log("✅ Nuevas preferencias creadas:", newPreferences);
        return NextResponse.json({
            results: [
                {
                    toolCallId: toolCall.id,
                    result: "New player preferences created successfully"
                }
            ]
        }, { status: 201 });

    } catch (err) {
        console.log("[playerpreferences_POST]", err);
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
