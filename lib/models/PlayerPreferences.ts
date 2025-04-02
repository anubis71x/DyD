import mongoose from "mongoose";

const playerPreferencesSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
  gameStyle: { type: String }, // Estilo de juego preferido (ej. roleplay, combate, exploración)
  toneAtmosphere: { type: String }, // Tono o ambientación deseada (oscuro, épico, humorístico)
  contentBoundaries: [String], // Temas a evitar en la narrativa
  pacingPreferences: { type: String }, // Ritmo de la historia (rápido, moderado, lento)
  interactionStyle: { type: String }, // Estilo de interacción del jugador (estratégico, improvisado, narrativo)
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const PlayerPreferences = mongoose.models.PlayerPreferences || mongoose.model("PlayerPreferences", playerPreferencesSchema);

export default PlayerPreferences;
