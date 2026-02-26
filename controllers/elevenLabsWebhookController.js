/**
 * ElevenLabs post-call webhook: receive call audio (no Twilio recording needed).
 * Enable "Post-call audio" webhook in ElevenLabs and set URL to:
 *   https://YOUR_BACKEND/webhooks/elevenlabs-post-call
 * We pass chat_id in dynamic_variables when starting the call so we can link the audio to the chat.
 */
const Chat = require("../database/models/Chat");
const { uploadToS3 } = require("../config/s3");
const { summarizeTranscript } = require("../utils/summarizeTranscript");
const logger = require("../logs/logger");

/**
 * Find chat: by chat_id in payload, or by called_number + most recent without recording.
 * Checks both top-level and payload.data for chat_id / dynamic_variables.
 */
async function findChatForPayload(payload) {
  const data = payload.data ?? {};
  const chatId =
    payload.chat_id ||
    payload.chatId ||
    data.chat_id ||
    data.chatId ||
    payload.conversation_initiation_client_data?.dynamic_variables?.chat_id ||
    data.conversation_initiation_client_data?.dynamic_variables?.chat_id ||
    payload.dynamic_variables?.chat_id ||
    data.dynamic_variables?.chat_id;
  if (chatId) {
    const chat = await Chat.findById(chatId);
    if (chat) return chat;
  }
  const called =
    payload.called_number ||
    payload.calledNumber ||
    payload.system__called_number ||
    payload.to_number ||
    data.called_number ||
    data.calledNumber ||
    data.to_number;
  if (called) {
    const chat = await Chat.findOne({
      "metadata.toNumber": called,
      recordingS3Key: null,
      channel: "phone",
    })
      .sort({ startedAt: -1 })
      .limit(1)
      .exec();
    if (chat) return chat;
  }
  return null;
}

/**
 * Same as findChatForPayload but does not require recordingS3Key: null (for transcription webhook where chat may already have recording).
 */
async function findChatForTranscriptionPayload(payload) {
  const data = payload.data ?? {};
  const chatId =
    payload.chat_id ||
    payload.chatId ||
    data.chat_id ||
    data.chatId ||
    payload.conversation_initiation_client_data?.dynamic_variables?.chat_id ||
    data.conversation_initiation_client_data?.dynamic_variables?.chat_id ||
    payload.dynamic_variables?.chat_id ||
    data.dynamic_variables?.chat_id;
  if (chatId) {
    const chat = await Chat.findById(chatId);
    if (chat) return chat;
  }
  const called =
    payload.called_number ||
    payload.calledNumber ||
    payload.system__called_number ||
    payload.to_number ||
    data.called_number ||
    data.calledNumber ||
    data.to_number;
  if (called) {
    const chat = await Chat.findOne({
      "metadata.toNumber": called,
      channel: "phone",
    })
      .sort({ startedAt: -1 })
      .limit(1)
      .exec();
    if (chat) return chat;
  }
  return null;
}

/**
 * POST /webhooks/elevenlabs-post-call
 * Body: JSON with audio (base64), and optionally chat_id, called_number, etc.
 */
exports.postCall = async (req, res) => {
  try {
    const payload = req.body || {};
    logger.info("ElevenLabs webhook: received post-call", { keys: Object.keys(payload) });
    const audioB64 =
      payload.audio ||
      payload.audio_base64 ||
      payload.recording ||
      payload.recording_base64 ||
      (payload.data && (payload.data.audio || payload.data.audio_base64));
    if (!audioB64 || typeof audioB64 !== "string") {
      logger.warn("ElevenLabs webhook: no audio in payload");
      return res.status(200).json({ ok: false, reason: "no_audio" });
    }
    const chat = await findChatForPayload(payload);
    if (!chat) {
      logger.warn("ElevenLabs webhook: no matching chat", {
        chat_id: payload.chat_id || payload.chatId,
        called: payload.called_number || payload.calledNumber,
      });
      return res.status(200).json({ ok: false, reason: "no_chat" });
    }
    const buffer = Buffer.from(audioB64, "base64");
    if (buffer.length === 0) {
      return res.status(200).json({ ok: false, reason: "empty_audio" });
    }
    const key = `recordings/${chat._id.toString()}.mp3`;
    await uploadToS3(key, buffer, "audio/mpeg");
    chat.recordingS3Key = key;
    chat.status = "completed";
    if (payload.call_duration_secs != null) chat.durationSeconds = Number(payload.call_duration_secs);
    if (payload.system__call_duration_secs != null) chat.durationSeconds = Number(payload.system__call_duration_secs);
    await chat.save();
    logger.info(`ElevenLabs webhook: saved recording for chat ${chat._id}, S3 key ${key}`);
    return res.status(200).json({ ok: true, chatId: chat._id.toString() });
  } catch (err) {
    logger.error(`ElevenLabs webhook: ${err.message}`);
    return res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * Format seconds as "MM:SS" for transcript time.
 */
function formatTimeSeconds(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Normalize a single message from ElevenLabs payload to our format: { speaker, text, time }.
 * Supports: role/speaker (user|agent|assistant), text/message/content, start/start_time/start_s (seconds).
 */
function normalizeTranscriptItem(item) {
  if (!item || typeof item !== "object") return null;
  const text =
    item.text ?? item.message ?? item.content ?? item.transcript ?? "";
  const str = String(text).trim();
  if (!str) return null;
  const role = (item.role ?? item.speaker ?? item.type ?? "").toString().toLowerCase();
  const speaker = role === "user" ? "user" : "agent";
  const startSec =
    item.start ?? item.start_time ?? item.start_s ?? item.offset;
  const time = formatTimeSeconds(startSec);
  return { speaker, text: str, time };
}

/**
 * Extract call summary string from post_call_transcription payload (e.g. data.analysis.summary, data.summary).
 */
function extractSummaryFromPayload(payload) {
  const data = payload.data ?? payload;
  const raw =
    data.summary ??
    data.call_summary ??
    data.callSummary ??
    data.analysis?.summary ??
    data.analysis?.call_summary ??
    data.conversation_summary;
  if (raw == null) return null;
  const str = typeof raw === "string" ? raw : String(raw);
  return str.trim() || null;
}

/**
 * Extract transcript array from post_call_transcription payload.
 * Payload may follow GET Conversation format: data.transcript, data.messages, or nested analysis.
 */
function extractTranscriptFromPayload(payload) {
  const data = payload.data ?? payload;
  const raw =
    data.transcript ??
    data.messages ??
    data.conversation?.transcript ??
    data.conversation?.messages ??
    data.analysis?.transcript ??
    (Array.isArray(data) ? data : null);
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = [];
  for (const item of raw) {
    const normalized = normalizeTranscriptItem(item);
    if (normalized) out.push(normalized);
  }
  return out;
}

/**
 * POST /webhooks/elevenlabs-post-call-transcription
 * ElevenLabs post-call transcription webhook. Enable "Post-call transcription" in ElevenLabs
 * and set URL to: https://YOUR_BACKEND/webhooks/elevenlabs-post-call-transcription
 * We pass chat_id in dynamic_variables when starting the call so we can link the transcript to the chat.
 * Payload format follows ElevenLabs GET Conversation / post_call_transcription (data.transcript or data.messages).
 */
exports.postCallTranscription = async (req, res) => {
  try {
    const payload = req.body || {};
    logger.info("ElevenLabs webhook: received post-call-transcription", {
      keys: Object.keys(payload),
      hasData: Boolean(payload.data),
    });
    const chat = await findChatForTranscriptionPayload(payload);
    if (!chat) {
      logger.warn("ElevenLabs transcription webhook: no matching chat", {
        chat_id: payload.chat_id ?? payload.chatId ?? payload.data?.chat_id,
        called: payload.called_number ?? payload.to_number ?? payload.data?.called_number,
      });
      return res.status(200).json({ ok: false, reason: "no_chat" });
    }
    const transcript = extractTranscriptFromPayload(payload);
    let summary = extractSummaryFromPayload(payload);
    if (transcript.length > 0) chat.transcript = transcript;
    if (summary) chat.callSummary = summary;
    if (transcript.length === 0 && !summary) {
      logger.warn("ElevenLabs transcription webhook: no transcript or summary in payload", {
        chatId: chat._id.toString(),
      });
      return res.status(200).json({ ok: true, chatId: chat._id.toString(), transcript: [], saved: false });
    }
    if (transcript.length > 0 && !summary) {
      try {
        summary = await summarizeTranscript(transcript);
        chat.callSummary = summary;
        logger.info(`ElevenLabs webhook: auto-generated call summary for chat ${chat._id}`);
      } catch (e) {
        logger.warn(`ElevenLabs webhook: auto summary failed for ${chat._id}: ${e.message}`);
      }
    }
    if (payload.data?.call_duration_secs != null) chat.durationSeconds = Number(payload.data.call_duration_secs);
    if (payload.call_duration_secs != null) chat.durationSeconds = Number(payload.call_duration_secs);
    await chat.save();
    logger.info(
      `ElevenLabs webhook: saved transcript for chat ${chat._id}, ${transcript.length} messages${summary ? ", with summary" : ""}`
    );
    return res.status(200).json({
      ok: true,
      chatId: chat._id.toString(),
      transcriptLength: transcript.length,
    });
  } catch (err) {
    logger.error(`ElevenLabs transcription webhook: ${err.message}`);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
