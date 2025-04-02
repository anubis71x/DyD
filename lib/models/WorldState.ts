import mongoose from "mongoose";

const worldStateSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
  locationsVisited: [String],
  newLocationsDiscovered: [String],
  factionChanges: [String],
  environmentalChanges: [String],
  timeProgression: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const WorldState = mongoose.models.WorldState || mongoose.model("WorldState", worldStateSchema);

export default WorldState;
