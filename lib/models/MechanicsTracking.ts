import mongoose from "mongoose";

const mechanicsTrackingSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
  systemRules: [String],
  resourcesUsedGained: { type: Map, of: Number },
  combatEncounters: [String],
  skillChecks: [String],
  customRulesApplied: [String],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const MechanicsTracking = mongoose.models.MechanicsTracking || mongoose.model("MechanicsTracking", mechanicsTrackingSchema);

export default MechanicsTracking;
