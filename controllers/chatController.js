const Chat = require("../database/models/Chat");
const Feedback = require("../database/models/Feedback");
const { getPresignedPlaybackUrl, isConfigured } = require("../config/s3");
const { uploadRecordingFromUrl } = require("../utils/uploadRecordingToS3");
const { pollOnce } = require("../tools/twilioRecordingPoller");
const { generateAndSaveTranscript } = require("../utils/transcribeRecording");
const { summarizeTranscript } = require("../utils/summarizeTranscript");
const { extractEndReasonFromSummary, extractEndReasonAndTicketResolved } = require("../utils/extractEndReason");
const logger = require("../logs/logger");

/**
 * Create a new chat (e.g. when voice session starts).
 * Body: { agentId, channel? }
 */
exports.create = async (req, res) => {
  try {
    const { agentId, channel = "web" } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId is required" });
    const chat = await Chat.create({
      agentId: String(agentId).trim(),
      channel: channel === "phone" ? "phone" : "web",
    });
    res.status(201).json({
      chat: {
        id: chat._id.toString(),
        agentId: chat.agentId,
        channel: chat.channel,
        startedAt: chat.startedAt,
        status: chat.status,
      },
    });
  } catch (err) {
    logger.error(`chat create error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * List chats (newest first). For Call Log left panel.
 */
exports.list = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const chats = await Chat.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    const list = chats.map((c) => ({
      id: c._id.toString(),
      agentId: c.agentId,
      channel: c.channel,
      startedAt: c.startedAt,
      durationSeconds: c.durationSeconds,
      status: c.status,
      endReason: c.endReason,
      ticketResolved: c.ticketResolved ?? null,
      hasRecording: Boolean(c.recordingS3Key),
    }));
    res.json(list);
  } catch (err) {
    logger.error(`chat list error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get one chat by id. Returns recordingPlaybackUrl (presigned) if S3 is configured and recording exists.
 */
exports.getById = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id).lean();
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const payload = {
      id: chat._id.toString(),
      agentId: chat.agentId,
      channel: chat.channel,
      startedAt: chat.startedAt,
      durationSeconds: chat.durationSeconds,
      endReason: chat.endReason,
      ticketResolved: chat.ticketResolved ?? null,
      feedbackId: chat.feedbackId ? chat.feedbackId.toString() : null,
      status: chat.status,
      transcript: chat.transcript,
      callSummary: chat.callSummary ?? null,
      metadata: chat.metadata,
      recordingPlaybackUrl: null,
    };
    if (chat.recordingS3Key && isConfigured) {
      try {
        payload.recordingPlaybackUrl = await getPresignedPlaybackUrl(chat.recordingS3Key);
      } catch (e) {
        logger.warn(`Presigned URL failed for chat ${req.params.id}: ${e.message}`);
      }
    }
    res.json(payload);
  } catch (err) {
    logger.error(`chat getById error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Set recording for a chat by Twilio Call SID (for webhooks). Body: { sourceUrl }
 */
exports.setRecordingByCallSid = async (req, res) => {
  try {
    const chat = await Chat.findOne({ "metadata.callSid": req.params.callSid });
    if (!chat) return res.status(404).json({ error: "Chat not found for this call SID" });
    const { sourceUrl } = req.body;
    if (!sourceUrl || typeof sourceUrl !== "string") {
      return res.status(400).json({ error: "sourceUrl is required" });
    }
    const key = await uploadRecordingFromUrl(chat._id.toString(), sourceUrl.trim());
    chat.recordingS3Key = key;
    await chat.save();
    res.json({ ok: true, chatId: chat._id.toString(), recordingS3Key: key });
  } catch (err) {
    logger.error(`chat setRecordingByCallSid error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Set recording for a chat: download from sourceUrl (e.g. Twilio), upload to S3, save key.
 * Body: { sourceUrl }
 */
exports.setRecording = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const { sourceUrl } = req.body;
    if (!sourceUrl || typeof sourceUrl !== "string") {
      return res.status(400).json({ error: "sourceUrl is required" });
    }
    const key = await uploadRecordingFromUrl(chat._id.toString(), sourceUrl.trim());
    chat.recordingS3Key = key;
    await chat.save();
    res.json({ ok: true, recordingS3Key: key });
  } catch (err) {
    logger.error(`chat setRecording error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Manual trigger: run Twilio recording poll once and return result (for debugging).
 */
exports.pollRecordings = async (_req, res) => {
  try {
    const result = await pollOnce();
    res.json(result);
  } catch (err) {
    logger.error(`chat pollRecordings error: ${err.message}`);
    res.status(500).json({ error: err.message, details: [] });
  }
};

/**
 * Generate transcript from recording (OpenAI Whisper), save to chat. Requires OPENAI_API_KEY and S3.
 * Automatically generates and saves call summary from the transcript when GEMINI_API_KEY is set.
 */
exports.generateTranscript = async (req, res) => {
  try {
    const result = await generateAndSaveTranscript(req.params.id, Chat);
    if (!result.ok) {
      const status = result.error === "Chat not found" ? 404 : result.error === "No recording" ? 400 : 500;
      return res.status(status).json({ ok: false, error: result.error });
    }
    let callSummary = null;
    if (result.transcript && result.transcript.length > 0) {
      try {
        const chat = await Chat.findById(req.params.id);
        if (chat && (!chat.callSummary || !String(chat.callSummary).trim())) {
          callSummary = await summarizeTranscript(result.transcript);
          chat.callSummary = callSummary;
          await chat.save();
          logger.info(`Auto-generated call summary for chat ${req.params.id}`);
        }
      } catch (e) {
        logger.warn(`Auto summary after transcript failed for ${req.params.id}: ${e.message}`);
      }
    }
    res.json({ ok: true, transcript: result.transcript, callSummary: callSummary ?? undefined });
  } catch (err) {
    logger.error(`chat generateTranscript error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Generate call summary from transcript using Gemini, save to chat.callSummary.
 * Requires GEMINI_API_KEY and chat to have a non-empty transcript.
 */
exports.generateSummary = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!chat.transcript || !Array.isArray(chat.transcript) || chat.transcript.length === 0) {
      return res.status(400).json({ error: "No transcript available. Generate a transcript first." });
    }
    const summary = await summarizeTranscript(chat.transcript);
    chat.callSummary = summary;
    await chat.save();
    logger.info(`Call summary saved for chat ${chat._id}`);
    res.json({ ok: true, callSummary: summary });
  } catch (err) {
    logger.error(`chat generateSummary error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Extract end reason and ticket resolved from chat's call summary using OpenAI, optionally save to chat.
 * Returns { endReason, ticketResolved }. Requires OPENAI_API_KEY and chat to have callSummary.
 */
exports.extractEndReason = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const summary = chat.callSummary && String(chat.callSummary).trim();
    if (!summary) {
      return res.status(400).json({ error: "No call summary available. Generate a summary first." });
    }
    const { endReason, ticketResolved } = await extractEndReasonAndTicketResolved(summary);
    const saveToChat = req.query.save !== "false";
    if (saveToChat) {
      if (endReason) chat.endReason = endReason;
      if (ticketResolved) chat.ticketResolved = ticketResolved;
      if (endReason || ticketResolved) {
        await chat.save();
        logger.info(`Extracted and saved end reason / ticket resolved for chat ${chat._id}`);
      }
    }

    // Auto-resolve linked feedback when the bot confirms ticket is resolved
    let feedbackResolved = false;
    if (ticketResolved === "yes" && chat.feedbackId) {
      try {
        const feedback = await Feedback.findById(chat.feedbackId);
        if (feedback && feedback.status !== "resolved") {
          feedback.status = "resolved";
          feedback.resolvedAt = new Date();
          if (!feedback.resolutionNote) {
            feedback.resolutionNote = `Auto-resolved: voice bot call confirmed ticket resolved (Chat ${chat._id})`;
          }
          await feedback.save();
          feedbackResolved = true;
          logger.info(`Auto-resolved feedback ${chat.feedbackId} from chat ${chat._id} (ticketResolved=yes)`);
        }
      } catch (e) {
        logger.warn(`Failed to auto-resolve feedback ${chat.feedbackId}: ${e.message}`);
      }
    }

    res.json({ endReason: endReason || null, ticketResolved: ticketResolved || null, feedbackResolved });
  } catch (err) {
    logger.error(`chat extractEndReason error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Optional: PATCH chat (duration, endReason, status, transcript, metadata).
 */
exports.patch = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const allowed = ["durationSeconds", "endReason", "ticketResolved", "status", "transcript", "callSummary", "metadata"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) chat[key] = req.body[key];
    }
    await chat.save();
    res.json({
      id: chat._id.toString(),
      agentId: chat.agentId,
      channel: chat.channel,
      startedAt: chat.startedAt,
      durationSeconds: chat.durationSeconds,
      endReason: chat.endReason,
      ticketResolved: chat.ticketResolved ?? null,
      status: chat.status,
      hasRecording: Boolean(chat.recordingS3Key),
    });
  } catch (err) {
    logger.error(`chat patch error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
