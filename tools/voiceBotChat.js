const logger = require("../logs/logger");

const OPENAI_MODEL_MAP = {
  "gpt-4.1-mini": "gpt-4o-mini",
  "gpt-4.1-nano": "gpt-4o-mini",
  "gpt-4.1": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4o": "gpt-4o",
  "gpt-4-turbo": "gpt-4-turbo",
  "gpt-4": "gpt-4",
  "gpt-3.5-turbo": "gpt-3.5-turbo",
};

function buildSystemPrompt(config) {
  const parts = [];
  if (config.objective) parts.push(`Objective: ${config.objective}`);
  parts.push(config.prompt);
  return parts.join("\n\n");
}

function substituteVariables(text, vars) {
  if (!vars || Object.keys(vars).length === 0) return text;
  return text.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] ?? `\${${key}}`);
}

/**
 * Call OpenAI chat completions using the voice agent's config.
 * @param {object} config  - VoiceAgent document (or plain object with prompt, model, etc.)
 * @param {string} userMessage
 * @param {Array}  history - [{ role, content }]
 * @param {object} [contextVariables]
 * @returns {Promise<string>} assistant reply
 */
async function getAgentReply(config, userMessage, history = [], contextVariables) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const systemPrompt = substituteVariables(buildSystemPrompt(config), contextVariables);
  const firstMessage = substituteVariables(config.firstMessage || "", contextVariables);
  const model = OPENAI_MODEL_MAP[config.model] ?? config.model ?? "gpt-4o-mini";

  const messages = [{ role: "system", content: systemPrompt }];

  if (firstMessage && history.length === 0) {
    messages.push({ role: "assistant", content: firstMessage });
  }

  for (const m of history) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: userMessage });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, temperature: config.temperature, messages }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error(`OpenAI API error: ${res.status} ${err}`);
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty reply from OpenAI");
  return content;
}

module.exports = { getAgentReply };
