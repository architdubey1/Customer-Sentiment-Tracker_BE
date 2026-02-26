const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    agentId: {
      type: String,
      required: true,
      trim: true,
    },
    channel: {
      type: String,
      enum: ["web", "phone"],
      default: "web",
    },
    /** S3 object key after recording is uploaded (e.g. recordings/chatId.mp3) */
    recordingS3Key: {
      type: String,
      default: null,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    durationSeconds: {
      type: Number,
      default: null,
    },
    endReason: {
      type: String,
      trim: true,
      default: null,
    },
    /** Whether the ticket was resolved (extracted from summary or set manually). "yes" | "no" | null */
    ticketResolved: {
      type: String,
      trim: true,
      enum: ["yes", "no"],
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "completed", "no_response", "unknown"],
      default: "active",
    },
    /** Optional transcript: [{ speaker: 'agent'|'user', text, time }] */
    transcript: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    /** Optional call summary (e.g. from ElevenLabs post-call analysis or generated from transcript) */
    callSummary: {
      type: String,
      default: null,
      trim: true,
    },
    /** Optional metadata (provider, etc.) */
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

chatSchema.index({ createdAt: -1 });
chatSchema.index({ agentId: 1, createdAt: -1 });
chatSchema.index({ "metadata.callSid": 1 });

module.exports = mongoose.model("Chat", chatSchema);
