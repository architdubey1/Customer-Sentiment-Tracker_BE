const mongoose = require("mongoose");

const voiceAgentSchema = new mongoose.Schema(
  {
    agentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: { type: String, trim: true, default: "" },
    slug: { type: String, trim: true, default: "" },
    provider: { type: String, default: "openai" },
    model: { type: String, default: "gpt-4o-mini" },
    temperature: { type: Number, default: 0.7, min: 0, max: 2 },
    firstMessage: { type: String, default: "" },
    waitBeforeSpeaking: { type: Number, default: 0 },
    objective: { type: String, default: "" },
    prompt: { type: String, default: "" },
    selectedTools: { type: [String], default: [] },
    libraryAccess: {
      type: String,
      enum: ["enabled", "disabled"],
      default: "disabled",
    },
    elevenlabsAgentId: { type: String, default: "" },
    elevenlabsVoiceId: { type: String, default: "" },
    callEndPrompt: { type: String, default: "" },
    callEndMessageType: {
      type: String,
      enum: ["dynamic", "static"],
      default: "dynamic",
    },
    callEndMessage: { type: String, default: "" },
    uninterruptibleReasons: { type: [String], default: [] },
    /** ElevenLabs conversation client_events (e.g. interruption, user_transcript). Empty = use default with interruption enabled. */
    clientEvents: { type: [String], default: [] },
    /** TTS speech speed (0.5–1.2, default 1). ElevenLabs agent response speed; API max is 1.2. */
    ttsSpeed: { type: Number, default: 1, min: 0.5, max: 1.2 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VoiceAgent", voiceAgentSchema);
