import mongoose from "mongoose";

/** 📌 Definir el esquema para las misiones dentro de una sesión */
const questSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
  quests: [
    {
      title: { type: String },
      description: { type: String },
      status: { type: String, enum: ["active", "completed", "failed"], default: "active" },
      relatedNPCs: [String],
      objectives: [String],
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }
  ]
});

const Quest = mongoose.models.Quest || mongoose.model("Quest", questSchema);

export default Quest;
