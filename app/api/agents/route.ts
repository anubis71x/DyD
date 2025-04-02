import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import VapiAgent from "@/lib/models/VapiAgent";
import axios from "axios";

const NEXT_PUBLIC_VAPI_PRIVATE_KEY = process.env.NEXT_PUBLIC_VAPI_PRIVATE_KEY!;
let lastSync = 0;
const CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 horas

/** 📌 Obtener agentes desde la API de Vapi */
const fetchAgentsFromVapi = async () => {
  const res = await axios.get("https://api.vapi.ai/assistant", {
    headers: {
      Authorization: `Bearer ${NEXT_PUBLIC_VAPI_PRIVATE_KEY}`,
    },
  });

  return res.data;
};

/** 📌 Guardar o actualizar agentes en MongoDB */
const upsertAgentsToMongo = async (agents: any[]) => {
  for (const agent of agents) {
    await VapiAgent.findOneAndUpdate(
      { agentId: agent.id },
      {
        agentId: agent.id,
        name: agent.name,
        description: "", // Podés mapear otro campo si querés usar descripción
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
};

/** 📌 Ruta principal: GET /api/vapi/agents */
export const GET = async (req: NextRequest) => {
  try {
    await connectToDB();

    const url = new URL(req.url || "");
    const id = url.searchParams.get("id");
    const sync = url.searchParams.get("sync");

    // ✅ Sincronizar manualmente o cada 12h
    const now = Date.now();
    const shouldSync = sync === "true" || now - lastSync > CACHE_DURATION;

    if (shouldSync) {
      console.log("🔄 Sincronizando agentes desde Vapi...");
      const agentsFromVapi = await fetchAgentsFromVapi();
      await upsertAgentsToMongo(agentsFromVapi);
      lastSync = now;
    }

    // ✅ Obtener un agente por ID
    if (id) {
      const agent = await VapiAgent.findOne({ _id: id });
      console.log(`✅ Agente "${agent.name}" encontrado`);
      return NextResponse.json(agent || { message: "Agent not found" }, { status: agent ? 200 : 404 });
    }

    // ✅ Traer todos los agentes
    const allAgents = await VapiAgent.find({});
    console.log(`✅ ${allAgents.length} agentes encontrados`);
    return NextResponse.json(allAgents, { status: 200 });
  } catch (err) {
    console.error("[vapiAgents_GET] Error:", err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
};