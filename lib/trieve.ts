import axios from "axios";

const TRIEVE_UPLOAD_URL = "https://api.trieve.ai/api/file";
const TRIEVE_DELETE_URL = "https://api.trieve.ai/api/file";

const trieveApiKey = process.env.TRIEVE_API_KEY;
const trieveDataSet = process.env.TRIEVE_DATASET;
const trieveOrganization = process.env.TRIEVE_ORGANIZATION;

/**
 * 📌 Sube un PDF a Trieve utilizando un buffer en memoria.
 * @param {Buffer} pdfBuffer - El archivo PDF en formato buffer.
 * @returns {Promise<any>} - Datos de la respuesta de Trieve.
 */
export const uploadPDFToTrieve = async (pdfBuffer: Buffer) => {
  try {
    const base64File = pdfBuffer.toString("base64");

    const body = {
      base64_file: base64File,
      file_name: `session_report_${Date.now()}.pdf`,
      description: "Session report for Dreampool campaign",
      metadata: { type: "session-report" }
    };

    const response = await axios.post(TRIEVE_UPLOAD_URL, body, {
      headers: {
        Authorization: `Bearer ${trieveApiKey}`,
        "Content-Type": "application/json",
        "TR-Dataset": trieveDataSet || "default-dataset",
        "TR-Organization": trieveOrganization || "default-org"
      },
    });

    console.log("✅ PDF subido a Trieve:", response.data);
    return response.data; // Retorna datos, incluyendo datasetId
  } catch (error: any) {
    console.error("❌ Error al subir PDF a Trieve:", error.message);
    throw new Error("Failed to upload PDF to Trieve");
  }
};

/**
 * 📌 Elimina un archivo en Trieve utilizando su ID.
 * @param {string} fileId - ID del archivo en Trieve.
 * @returns {Promise<void>}
 */
export const deleteExistingPDFInTrieve = async (fileId: string) => {
  try {
    const deleteUrl = `${TRIEVE_DELETE_URL}/${fileId}`;
    await axios.delete(deleteUrl, {
      headers: {
        Authorization: `Bearer ${trieveApiKey}`,
        "TR-Dataset": trieveDataSet || "default-dataset"
      }
    });

    console.log(`✅ PDF eliminado de Trieve: ${fileId}`);
  } catch (error: any) {
    console.error("❌ Error al eliminar PDF de Trieve:", error.message);
  }
};
