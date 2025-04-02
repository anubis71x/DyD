import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import VapiAgent from "@/lib/models/VapiAgent";
import axios from "axios";

const NEXT_PUBLIC_VAPI_PRIVATE_KEY = process.env.NEXT_PUBLIC_VAPI_PRIVATE_KEY!;

export const GET = async (req: NextRequest) => {
  try {
    await connectToDB();

    const res = await axios.get("https://api.vapi.ai/assistant", {
      headers: {
        Authorization: `Bearer ${NEXT_PUBLIC_VAPI_PRIVATE_KEY}`,
      },
    });

    const agents = res.data;

    for (const agent of agents) {
      await VapiAgent.findOneAndUpdate(
        { agentId: agent.id },
        {
          agentId: agent.id,
          name: agent.name,
          description: "",
          voice: agent.voice,
          model: {
            model: agent.model?.model,
            provider: agent.model?.provider,
            toolIds: agent.model?.toolIds,
            messages: agent.model?.messages,
            maxTokens: agent.model?.maxTokens,
            temperature: agent.model?.temperature,
            emotionRecognitionEnabled: agent.model?.emotionRecognitionEnabled
          },
          transcriber: agent.transcriber,
          firstMessage: agent.firstMessage,
          endCallMessage: agent.endCallMessage,
          silenceTimeoutSeconds: agent.silenceTimeoutSeconds,
          maxDurationSeconds: agent.maxDurationSeconds,
          createdAt: agent.createdAt,
          updatedAt: agent.updatedAt,
          dbUpdatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }

    console.log(`✅ ${agents.length} agentes sincronizados correctamente desde Vapi.`);
    return NextResponse.json({ message: "Sync successful", count: agents.length }, { status: 200 });

  } catch (error) {
    console.error("❌ Error al sincronizar agentes desde Vapi:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
};