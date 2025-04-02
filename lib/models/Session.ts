import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  uId: { type: String, required: true, index: true },
  duration: { type: Number , default: 0 },
  campaign: { type: String, default: "New Campaing" },
  pdfFileId: { type: String, default: "" },
  knowledgeBaseId: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Session = mongoose.models.Session || mongoose.model("Session", sessionSchema);

export default Session;
