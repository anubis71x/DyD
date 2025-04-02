import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import Session from "@/lib/models/Session";
import { convertToCamelCase } from "@/lib/utils";

export const POST = async (req: NextRequest) => {
    try {
        const body = await req.json();
        const camelCaseBody = convertToCamelCase(body);

        const toolCall = camelCaseBody.message.toolCalls.find(
            (call: any) => call.function.name === "updateCampaignName"
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
        const { uId, sessionId, campaign } = args;

        if (!sessionId || !uId) {
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "Missing sessionId or userId"
                    }
                ]
            }, { status: 400 });
        }

        await connectToDB();
        const updatedSession = await Session.findOneAndUpdate(
            { _id: sessionId, uId: uId },
            { ...(campaign && { campaign }) },
            { new: true }
        );

        if (updatedSession) {
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "Campaign name updated successfully"
                    }
                ]
            }, { status: 200 });
        } else {
            return NextResponse.json({
                results: [
                    {
                        toolCallId: toolCall.id,
                        result: "Session not found"
                    }
                ]
            }, { status: 404 });
        }
    } catch (err) {
        console.log("[sessions_PUT]", err);
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
