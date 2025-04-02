import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import Character from "@/lib/models/Character";
import { convertToCamelCase } from "@/lib/utils";

export const POST = async (req: NextRequest) => {
    try {
        const body = await req.json();
        const camelCaseBody = convertToCamelCase(body);  // 🔄 Convertir a camelCase

        const toolCall = camelCaseBody.message.toolCalls.find(
            (call: any) => call.function.name === "updateCharacterData"
        );

        if (!toolCall) {
            console.log("❌ Tool call not found");
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
        console.log("✅ Datos en arguments:", args);

        const { sessionId } = args;

        if (!sessionId) {
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "Missing session ID"
                    }
                ]
            }, { status: 400 });
        }

        const character = args.character ?? {
            name: args.name,
            classRole: args.classRole,
            keyAttributes: args.keyAttributes ?? {},
            resources: args.resources ?? {},
            notableAbilities: args.notableAbilities ?? [],
            equipment: args.equipment ?? [],
            characterGoals: args.characterGoals ?? []
        };

        if (!character || Object.keys(character).length === 0) {
            console.log("❌ `character` está vacío o es undefined");
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "Invalid character data"
                    }
                ]
            }, { status: 400 });
        }

        await connectToDB();

        const existingCharacter = await Character.findOne({ sessionId });

        if (existingCharacter) {
            // ✅ Mantener los datos antiguos + los nuevos sin duplicar arrays
            const mergedCharacter = {
                ...existingCharacter.toObject(),
                ...character,
                notableAbilities: [
                    ...new Set([
                        ...existingCharacter.toObject().notableAbilities,
                        ...(character.notableAbilities ?? [])
                    ])
                ],
                equipment: [
                    ...new Set([
                        ...existingCharacter.toObject().equipment,
                        ...(character.equipment ?? [])
                    ])
                ],
                characterGoals: [
                    ...new Set([
                        ...existingCharacter.toObject().characterGoals,
                        ...(character.characterGoals ?? [])
                    ])
                ]
            };

            const updatedCharacter = await Character.findOneAndUpdate(
                { sessionId },
                { $set: mergedCharacter },
                { new: true }
            );
            console.log("✅ Personaje actualizado:", updatedCharacter);
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "Character updated successfully"
                    }
                ]
            }, { status: 200 });
        }

        const newCharacter = await Character.create({
            sessionId,
            ...character
        });

        console.log("✅ Nuevo personaje creado:", newCharacter);
        return NextResponse.json({
            results: [
                {
                    toolCallId: toolCall.id,
                    result: "Character created successfully"
                }
            ]
        }, { status: 201 });

    } catch (err) {
        console.log("[characters_POST] Error:", err);
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
