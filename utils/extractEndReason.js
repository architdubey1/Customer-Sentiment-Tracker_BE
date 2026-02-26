/**
 * Extract end reason and ticket resolved from a call summary using OpenAI.
 * Requires OPENAI_API_KEY.
 */

const logger = require("../logs/logger");

const SYSTEM_PROMPT_END_REASON = `You are an assistant that extracts why a call ended from a call summary.
Given a call summary, respond with a single short phrase (under 15 words) describing how or why the call ended.

Examples: "Customer hung up", "Agent ended call after resolving issue", "Call disconnected", "Customer satisfied and ended call", "Issue resolved and ticket closed", "Callback scheduled".

Infer from context when possible:
- If the summary says the issue was resolved, the customer was satisfied, or the ticket was closed → use something like "Issue resolved" or "Customer satisfied, call ended".
- If the summary mentions scheduling a callback or follow-up → use "Callback or follow-up scheduled".
- If the summary suggests the customer would be contacted later or case reassigned → use "Reassigned to human / follow-up promised".
- Only respond with exactly "Unknown" if the summary gives no hint at all about how or why the call ended.`;

const SYSTEM_PROMPT_BOTH = `You are an assistant that reads a call summary and extracts two things. You MUST respond with valid JSON only, no other text or markdown.

Required format (use exactly these keys):
{"endReason": "short phrase", "ticketResolved": "yes" or "no"}

Instructions:
1. Read the full summary. Determine whether the call was about a ticket, issue, or request (e.g. support request, complaint, question, follow-up). Then determine whether that ticket/issue was resolved by the end of the call.

2. endReason: One short phrase (under 15 words) for how or why the call ended. Examples: "Issue resolved", "Customer hung up", "Callback scheduled", "Reassigned to human". Use "Unknown" only if there is no hint.

3. ticketResolved: You MUST set this to either "yes" or "no".
   - "yes": The summary indicates the customer's issue/ticket/request was resolved, the customer was satisfied, the ticket was closed, or the problem was fixed during the call.
   - "no": The summary indicates the issue was not resolved, or will be followed up (callback, reassignment, escalation), or no clear ticket/issue was discussed, or the outcome is unclear.

Always output both endReason and ticketResolved. Never omit ticketResolved.`;

/**
 * @param {string} summary - Call summary text
 * @returns {Promise<string>} Extracted end reason phrase
 */
async function extractEndReasonFromSummary(summary) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to extract end reason");

  const text = String(summary || "").trim();
  if (!text) throw new Error("Summary is empty");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      temperature: 0.2,
      max_tokens: 80,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_END_REASON },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error(`OpenAI extractEndReason error: ${res.status} ${err}`);
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty reply from OpenAI");
  return content;
}

/**
 * Extract end reason and ticket resolved in one call. Returns { endReason, ticketResolved }.
 * @param {string} summary - Call summary text
 * @returns {Promise<{ endReason: string | null, ticketResolved: "yes" | "no" | null }>}
 */
async function extractEndReasonAndTicketResolved(summary) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const text = String(summary || "").trim();
  if (!text) throw new Error("Summary is empty");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 150,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_BOTH },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error(`OpenAI extractEndReasonAndTicketResolved error: ${res.status} ${err}`);
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return { endReason: null, ticketResolved: null };

  function parseJsonResponse(raw) {
    const cleaned = raw.replace(/```json?\s*|\s*```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const str = match ? match[0] : cleaned;
    return JSON.parse(str);
  }

  try {
    const parsed = parseJsonResponse(content);
    let endReason = (parsed.endReason || "").trim();
    if (endReason.toLowerCase() === "unknown") endReason = null;
    let ticketResolved = (parsed.ticketResolved || "").toString().toLowerCase().trim();
    if (ticketResolved !== "yes" && ticketResolved !== "no") {
      ticketResolved = null;
      logger.warn("extractEndReasonAndTicketResolved: ticketResolved was not yes/no", { raw: parsed.ticketResolved, content: content.slice(0, 200) });
    }
    return { endReason: endReason || null, ticketResolved };
  } catch (e) {
    logger.warn("extractEndReasonAndTicketResolved parse failed, falling back to endReason only", { err: e.message, content: content?.slice(0, 300) });
    const endReason = await extractEndReasonFromSummary(summary);
    const reasonNorm = (endReason || "").trim().toLowerCase();
    return {
      endReason: reasonNorm === "unknown" ? null : endReason,
      ticketResolved: null,
    };
  }
}

module.exports = { extractEndReasonFromSummary, extractEndReasonAndTicketResolved };
