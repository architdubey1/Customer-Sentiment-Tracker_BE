const mongoose = require("mongoose");
const { SENTIMENT_LABELS } = require("../../constants/sentiments");
const { PRIORITY_LABELS, URGENCY_LABELS, ISSUE_CATEGORY_LABELS } = require("../../constants/priority");

const feedbackSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, "Feedback text is required"],
      trim: true,
      maxlength: [5000, "Feedback text cannot exceed 5000 characters"],
    },
    sentiment: {
      type: String,
      required: true,
      enum: SENTIMENT_LABELS,
      lowercase: true,
    },
    score: {
      type: Number,
      required: true,
      min: -1,
      max: 1,
    },
    source: {
      type: String,
      enum: ["api", "email"],
      default: "api",
    },
    senderEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    senderName: {
      type: String,
      trim: true,
    },
    gmailMessageId: {
      type: String,
      unique: true,
      sparse: true,
    },
    emailSubject: {
      type: String,
      trim: true,
    },
    urgency: {
      type: String,
      enum: URGENCY_LABELS,
      default: "low",
    },
    urgencyKeywords: {
      type: [String],
      default: [],
    },
    priorityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    priorityLevel: {
      type: String,
      enum: PRIORITY_LABELS,
      default: "low",
    },
    issueCategory: {
      type: String,
      enum: ISSUE_CATEGORY_LABELS,
      default: "other",
      lowercase: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
  },
  {
    timestamps: true,
  }
);

feedbackSchema.index({ sentiment: 1 });
feedbackSchema.index({ createdAt: -1 });
feedbackSchema.index({ senderEmail: 1 });
feedbackSchema.index({ priorityScore: -1 });
feedbackSchema.index({ priorityLevel: 1, priorityScore: -1 });
feedbackSchema.index({ issueCategory: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
