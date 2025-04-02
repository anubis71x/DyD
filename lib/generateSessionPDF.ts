import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

/**
 * 📌 Genera un PDF en memoria con los datos de la sesión.
 * @param {string} sessionId - ID de la sesión.
 * @param {any} pdfData - Datos de la sesión.
 * @returns {Promise<Buffer>} - PDF en formato buffer listo para subir.
 */
export const generateSessionPDF = async (sessionId: string, pdfData: any): Promise<Buffer> => {
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let yPosition = height - 50;
    const lineHeight = 20;

    const writeText = (text: string) => {
        if (yPosition < 50) {
            page = pdfDoc.addPage([600, 800]);
            yPosition = height - 50;
        }
        page.drawText(text, { x: 50, y: yPosition, size: 12, font, color: rgb(0, 0, 0) });
        yPosition -= lineHeight;
    };

    // 📌 Encabezado del PDF
    writeText(`Session Report - ${sessionId}`);
    writeText(`Date: ${new Date().toLocaleDateString()}`);
    writeText("--------------------------------------------------");

    // 📌 Función para manejar secciones con listas y objetos anidados
    const writeSection = (title: string, content: any) => {
        writeText(title);
        if (!content) {
            writeText("N/A");
        } else if (Array.isArray(content)) {
            content.length ? content.forEach((item) => writeText(`- ${item}`)) : writeText("N/A");
        } else if (typeof content === "object") {
            let hasContent = false;
            Object.entries(content).forEach(([key, value]) => {
                if (Array.isArray(value) && value.length) {
                    hasContent = true;
                    writeText(`- ${key}:`);
                    value.forEach((item) => writeText(`  - ${item}`));
                } else if (value) {
                    hasContent = true;
                    writeText(`- ${key}: ${value}`);
                }
            });
            if (!hasContent) writeText("N/A");
        } else {
            writeText(content.toString());
        }
        writeText("");
    };

    // 📌 Secciones estándar
    writeSection("Session Summary", pdfData.sessionSummary);
    writeSection("Character Information", pdfData.characterInfo);
    writeSection("Quest Log", pdfData.questLog);
    writeSection("World Details", pdfData.worldDetails);
    writeSection("NPC Details", pdfData.npcDetails);
    writeSection("Mechanics Tracking", pdfData.mechanicsTracking);

    // 📌 Secciones con estructura anidada
    writeSection("Narrative Development", pdfData.narrativeDevelopment);
    writeSection("Next Session Plan", pdfData.nextSessionPlan);
    writeSection("Notable Quotes", pdfData.notableQuotes);

    // 📌 Guardamos el PDF en memoria y lo retornamos como Buffer
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
};
