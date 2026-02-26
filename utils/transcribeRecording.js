/**
 * Transcribe audio from S3 using OpenAI Whisper API.
 * Returns transcript in chat format: [{ speaker: 'agent'|'user', text, time }]
 * Whisper does not provide speaker diarization; we label all segments as "agent" (outbound calls are agent-led; for accurate speaker labels use ElevenLabs post-call transcription).
 */
const { getObjectBuffer, isConfigured: s3Configured } = require("../config/s3");
const logger = require("../logs/logger");

function formatTimeSeconds(seconds) {
  const m = Math.floor(Number(seconds) / 60);
  const s = Math.floor(Number(seconds) % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Call OpenAI Whisper API with audio buffer. Returns segments with start/end/text.
 * @param {Buffer} audioBuffer
 * @param {string} [mimeType] - e.g. 'audio/mpeg'
 * @returns {Promise<{ segments: Array<{ start: number, end: number, text: string }> }>}
 */
async function transcribeWithWhisper(audioBuffer, mimeType = "audio/mpeg") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for transcription");

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append("file", blob, "audio.mp3");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const segments = (data.segments || []).filter((s) => s.text && String(s.text).trim());
  return { segments, duration: data.duration };
}

/**
 * Build chat transcript from Whisper segments. Whisper has no speaker diarization, so we label all as "agent"
 * (outbound calls are agent-led; consecutive agent lines are no longer mislabeled as user).
 * For correct speaker labels, use ElevenLabs post-call transcription webhook when available.
 * @param {Array<{ start: number, end: number, text: string }>} segments
 * @returns {Array<{ speaker: 'agent'|'user', text: string, time: string }>}
 */
function segmentsToTranscript(segments) {
  return segments.map((seg) => ({
    speaker: "agent",
    text: String(seg.text).trim(),
    time: formatTimeSeconds(seg.start),
  }));
}

/**
 * Transcribe recording from S3 and return transcript array for chat.
 * @param {string} s3Key - e.g. recordings/chatId.mp3
 * @returns {Promise<Array<{ speaker: 'agent'|'user', text: string, time: string }>>}
 */
async function transcribeFromS3(s3Key) {
  if (!s3Configured) throw new Error("S3 not configured");
  const buffer = await getObjectBuffer(s3Key);
  if (!buffer || buffer.length === 0) throw new Error("Empty recording");
  const { segments } = await transcribeWithWhisper(buffer, "audio/mpeg");
  return segmentsToTranscript(segments);
}

/**
 * Generate transcript for a chat (by id), save to DB. Idempotent: skips if no recording or already has transcript.
 * @param {string} chatId - MongoDB ObjectId string
 * @param {object} Chat - Mongoose Chat model
 * @returns {Promise<{ ok: boolean, transcript?: array, error?: string }>}
 */
async function generateAndSaveTranscript(chatId, Chat) {
  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return { ok: false, error: "Chat not found" };
    if (!chat.recordingS3Key) return { ok: false, error: "No recording" };
    if (chat.transcript && Array.isArray(chat.transcript) && chat.transcript.length > 0) {
      return { ok: true, transcript: chat.transcript };
    }
    const transcript = await transcribeFromS3(chat.recordingS3Key);
    chat.transcript = transcript;
    await chat.save();
    logger.info(`Transcript saved for chat ${chatId}, ${transcript.length} segments`);
    return { ok: true, transcript };
  } catch (err) {
    logger.error(`Transcript generation failed for chat ${chatId}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  transcribeWithWhisper,
  segmentsToTranscript,
  transcribeFromS3,
  generateAndSaveTranscript,
  formatTimeSeconds,
};
