import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import MechanicsTracking from "@/lib/models/MechanicsTracking";
import { convertToCamelCase } from "@/lib/utils";

export const POST = async (req: NextRequest) => {
    try {
        const body = await req.json();
        const camelCaseBody = convertToCamelCase(body);

        const toolCall = camelCaseBody.message.toolCalls.find(
            (call: any) => call.function.name === "updateMechanicsTrackingData"
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
        const { sessionId, mechanicsTracking } = args;

        if (!sessionId || !mechanicsTracking) {
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "Missing sessionId or mechanicsTracking"
                    }
                ]
            }, { status: 400 });
        }

        const {
            systemRules = [],
            resourcesUsedGained = {},
            combatEncounters = [],
            skillChecks = [],
            customRulesApplied = []
        } = mechanicsTracking;

        await connectToDB();

        const existingTracking = await MechanicsTracking.findOne({ sessionId });

        if (existingTracking) {
            const mergedTracking = {
                ...existingTracking.toObject(),
                systemRules: [
                    ...new Set([
                        ...existingTracking.toObject().systemRules,
                        ...systemRules
                    ])
                ],
                resourcesUsedGained: {
                    ...existingTracking.toObject().resourcesUsedGained,
                    ...resourcesUsedGained
                },
                combatEncounters: [
                    ...new Set([
                        ...existingTracking.toObject().combatEncounters,
                        ...combatEncounters
                    ])
                ],
                skillChecks: [
                    ...new Set([
                        ...existingTracking.toObject().skillChecks,
                        ...skillChecks
                    ])
                ],
                customRulesApplied: [
                    ...new Set([
                        ...existingTracking.toObject().customRulesApplied,
                        ...customRulesApplied
                    ])
                ]
            };

            const updatedTracking = await MechanicsTracking.findOneAndUpdate(
                { sessionId },
                { $set: mergedTracking },
                { new: true }
            );
            console.log("✅ MechanicsTracking actualizado:", updatedTracking);
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "MechanicsTracking updated successfully"
                    }
                ]
            }, { status: 200 });
        }

        const newTracking = await MechanicsTracking.create({
            sessionId,
            systemRules,
            resourcesUsedGained,
            combatEncounters,
            skillChecks,
            customRulesApplied
        });

        console.log("✅ Nuevo MechanicsTracking creado:", newTracking);
        return NextResponse.json({
            results: [
                {
                    toolCallId: toolCall.id,
                    result: "New MechanicsTracking created successfully"
                }
            ]
        }, { status: 201 });

    } catch (err) {
        console.log("[mechanicsTracking_POST] Error:", err);
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
