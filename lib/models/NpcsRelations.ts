import mongoose from "mongoose";

const npcsRelationsSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
  npcs: [
    {
      name: { type: String },
      description: { type: String },
      relationship: { type: String, enum: ["friendly", "neutral", "hostile"], default: "neutral" },
      lastInteraction: { type: String },
      motivations: { type: String },
      dialogues: [{ type: String }],
    }
  ]
});

const NpcsRelations = mongoose.models.NpcsRelations || mongoose.model("NpcsRelations", npcsRelationsSchema);

export default NpcsRelations;
