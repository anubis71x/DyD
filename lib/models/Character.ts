import mongoose from "mongoose";

const characterSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
  name: { type: String },
  classRole: { type: String },
  keyAttributes: { type: Map, of: Number },
  resources: { type: Map, of: Number },
  notableAbilities: [String],
  equipment: [String],
  characterGoals: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Character = mongoose.models.Character || mongoose.model("Character", characterSchema);

export default Character;
