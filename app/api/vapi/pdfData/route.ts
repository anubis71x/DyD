import { NextRequest, NextResponse } from "next/server";
import { connectToDB } from "@/lib/mongoDB";
import { generateSessionPDF } from "@/lib/generateSessionPDF";
import { uploadPDFToTrieve, deleteExistingPDFInTrieve } from "@/lib/trieve";
import Session from "@/lib/models/Session";
import axios from "axios";
import { convertToCamelCase } from "@/lib/utils";

const vapiPrivateKey = process.env.NEXT_PUBLIC_VAPI_PRIVATE_KEY;

/**
 * 📌 Crea o actualiza una KB en VAPI, manteniendo los datos previos si existen.
 */
const createOrUpdateKnowledgeBaseInVapi = async (datasetId: string, sessionId: string, existingKnowledgeBaseId?: string) => {
    try {
        const apiUrl = existingKnowledgeBaseId
            ? `https://api.vapi.ai/knowledge-base/${existingKnowledgeBaseId}`
            : "https://api.vapi.ai/knowledge-base";

        const method = existingKnowledgeBaseId ? "PATCH" : "POST";

        const body = {
            createPlan: {
                type: "import",
                providerId: datasetId
            },
            name: `Dreampool Knowledge Base - Session ${sessionId}`
        };

        const response = await axios({
            method,
            url: apiUrl,
            data: body,
            headers: { Authorization: `Bearer ${vapiPrivateKey}` }
        });

        return response.data.id;
    } catch (error: any) {
        console.error("❌ Error en VAPI KB:", error.response?.data);
        throw new Error("Failed to create or update Knowledge Base");
    }
};

/**
 * 📌 Manejador de la ruta POST para recibir y procesar datos desde VAPI.
 */
export const POST = async (req: NextRequest) => {
    try {
        const body = await req.json();
        const camelCaseBody = convertToCamelCase(body);

        const toolCall = camelCaseBody.message.toolCalls.find(
            (call: any) => call.function.name === "updatePdfData"
        );

        if (!toolCall) {
            return NextResponse.json({ results: [{ toolCallId: "unknown", result: "Tool call not found" }] }, { status: 400 });
        }

        const args = toolCall.function.arguments;
        const { sessionId, pdfData } = args;

        if (!sessionId || !pdfData) {
            return NextResponse.json({ results: [{ toolCallId: toolCall.id, result: "Missing sessionId or pdfData" }] }, { status: 400 });
        }

        await connectToDB();
        const session = await Session.findOne({ _id: sessionId });

        let previousDatasetId = session?.knowledgeBaseId ?? null;
        let previousPdfFileId = session?.pdfFileId ?? null;

        // 📌 Si existe un PDF anterior, eliminarlo de Trieve
        if (previousPdfFileId) {
            await deleteExistingPDFInTrieve(previousPdfFileId);
        }

        // 📌 Generar el nuevo PDF en memoria
        const pdfBuffer = await generateSessionPDF(sessionId, pdfData);

        // 📌 Subir el nuevo PDF a Trieve y obtener su datasetId
        const uploadResponse = await uploadPDFToTrieve(pdfBuffer);
        const newPdfFileId = uploadResponse.file_metadata.id;
        const newDatasetId = uploadResponse.file_metadata.dataset_id;

        // 📌 Crear o actualizar la KB en VAPI con el nuevo datasetId
        const knowledgeBaseId = await createOrUpdateKnowledgeBaseInVapi(newDatasetId, sessionId, previousDatasetId);

        // 📌 Actualizar la sesión en la base de datos con los nuevos valores
        await Session.findOneAndUpdate( { _id: sessionId }, { pdfFileId: newPdfFileId, knowledgeBaseId } );

        return NextResponse.json({ results: [{ toolCallId: toolCall.id, result: "PDF and Knowledge Base updated successfully" }] }, { status: 200 });

    } catch (err) {
        console.error("[pdfData_POST] Error:", err);
        return NextResponse.json({ results: [{ toolCallId: "unknown", result: "Internal Error" }] }, { status: 500 });
    }
};

export const dynamic = "force-dynamic";