import mongoose from "mongoose";

const vapiAgentSchema = new mongoose.Schema({
  agentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },

  voice: {
    model: { type: String },
    style: { type: Number },
    voiceId: { type: String },
    provider: { type: String },
    stability: { type: Number },
    similarityBoost: { type: Number },
    optimizeStreamingLatency: { type: Number }
  },

  model: {
    model: { type: String },
    provider: { type: String },
    toolIds: [String],
    messages: [
      {
        role: { type: String },
        content: { type: String }
      }
    ],
    maxTokens: { type: Number },
    temperature: { type: Number },
    emotionRecognitionEnabled: { type: Boolean }
  },

  transcriber: {
    model: { type: String },
    language: { type: String },
    numerals: { type: Boolean },
    provider: { type: String }
  },

  firstMessage: { type: String, default: "" },
  endCallMessage: { type: String, default: "" },
  silenceTimeoutSeconds: { type: Number },
  maxDurationSeconds: { type: Number },

  createdAt: { type: Date },
  updatedAt: { type: Date },

  // timestamps automáticos de mongoose (como en el ejemplo original)
  dbCreatedAt: { type: Date, default: Date.now },
  dbUpdatedAt: { type: Date, default: Date.now }
});

const VapiAgent = mongoose.models.VapiAgent || mongoose.model("VapiAgent", vapiAgentSchema);

export default VapiAgent;
