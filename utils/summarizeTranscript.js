/**
 * Generate a short call summary from a transcript using Gemini.
 * @param {Array<{ speaker: string, text: string }>} transcript
 * @returns {Promise<string>} Plain-text summary (2-4 sentences).
 */
const geminiModel = require("../config/gemini");
const logger = require("../logs/logger");

const SUMMARY_PROMPT = `You are a call summarizer. Given a conversation transcript between an agent and a customer, write a brief call summary in 2-4 sentences. Include: what the customer needed, what was discussed or resolved, and the outcome if clear. Use neutral, professional language. Respond with only the summary text, no headings or labels.`;

async function summarizeTranscript(transcript) {
  if (!Array.isArray(transcript) || transcript.length === 0) {
    throw new Error("Transcript is required and must be a non-empty array");
  }
  const lines = transcript.map((m) => `${m.speaker === "user" ? "Customer" : "Agent"}: ${(m.text || "").trim()}`).filter((s) => s.length > 1);
  const text = lines.join("\n");
  if (!text.trim()) throw new Error("Transcript has no text to summarize");

  const result = await geminiModel.generateContent([
    SUMMARY_PROMPT,
    `Transcript:\n"""${text}"""`,
  ]);
  const summary = result.response.text().trim();
  if (!summary) throw new Error("Gemini returned an empty summary");
  return summary;
}

module.exports = { summarizeTranscript };
