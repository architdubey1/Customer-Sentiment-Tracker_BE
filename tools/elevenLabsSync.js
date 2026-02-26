const { ElevenLabsClient } = require("elevenlabs");
const logger = require("../logs/logger");

const EL_LLM_MAP = {
  "gpt-4.1-mini": "gpt-4.1-mini",
  "gpt-4.1-nano": "gpt-4.1-nano",
  "gpt-4.1": "gpt-4.1",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-4o": "gpt-4o",
  "gpt-4": "gpt-4",
  "gpt-4-turbo": "gpt-4-turbo",
  "gpt-3.5-turbo": "gpt-3.5-turbo",
  "gemini-1.5-pro": "gemini-1.5-pro",
  "gemini-1.5-flash": "gemini-1.5-flash",
  "gemini-2.0-flash-001": "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite": "gemini-2.0-flash-lite",
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-1.0-pro": "gemini-1.0-pro",
  "claude-3-7-sonnet": "claude-3-7-sonnet",
  "claude-3-5-sonnet": "claude-3-5-sonnet",
  "claude-3-5-sonnet-v1": "claude-3-5-sonnet-v1",
  "claude-3-haiku": "claude-3-haiku",
};

function extractPlaceholders(text) {
  const names = new Set();
  const re = /\$\{(\w+)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) names.add(m[1]);
  return [...names];
}

/** When to consider ending the call. Used when user has not set a custom Call End prompt. */
const DEFAULT_CALL_END_WHEN =
  "Use the closing flow and end the call when: the task has been completed, the user requests to end the call, the user is busy, becomes unresponsive, the call goes to voicemail, the user is abusive, the user provides a callback time, or when explicitly instructed in the prompt.";

/** Mandatory flow before ending: ask about resolving ticket; if decline/not satisfied, inform reassignment and 24–48h contact. */
const CLOSING_FLOW =
  "Before using the end_call tool you MUST follow this flow:\n" +
  "1. If the issue has been successfully resolved, politely ask the customer if we may mark the ticket as resolved and close it.\n" +
  "2. If the customer declines to close the ticket or is not fully satisfied, inform them that the case will be reassigned to a human executive within 24 hours, that they will be updated regarding the reassignment, and that the executive will contact them within 24–48 hours for further assistance. Then say a brief closing and use the end_call tool.\n" +
  "3. If the customer agrees to close the ticket, say a brief thank-you and use the end_call tool.";

function buildAgentPrompt(config) {
  const main = (config.prompt || "").trim();
  const callEndPrompt = (config.callEndPrompt || "").trim();
  const callEndMessage = (config.callEndMessage || "").trim();

  const whenToEnd = callEndPrompt.length > 0 ? callEndPrompt : DEFAULT_CALL_END_WHEN;
  const uninterruptible =
    config.uninterruptibleReasons?.length > 0
      ? ` Do not be interrupted when: ${config.uninterruptibleReasons.join(", ")}.`
      : "";

  const closingMessageLine =
    callEndMessage.length > 0
      ? `If you use a fixed closing phrase, prefer this (or a short variant): "${callEndMessage}". `
      : "";

  const closingInstruction =
    `${CLOSING_FLOW}\n\n${closingMessageLine}Only after completing the flow above, use the end_call tool to end the conversation.`;

  return `${main}\n\n### Call End\n\nWhen to end: ${whenToEnd}${uninterruptible}\n\n${closingInstruction}`;
}

/** Default client_events when not overridden (includes interruption for natural conversation). */
const DEFAULT_CLIENT_EVENTS = [
  "conversation_initiation_metadata",
  "asr_initiation_metadata",
  "ping",
  "audio",
  "interruption",
  "user_transcript",
  "tentative_user_transcript",
  "agent_response",
  "agent_response_correction",
  "agent_response_metadata",
  "agent_chat_response_part",
  "client_error",
];

function buildConversationConfig(config) {
  const llm = EL_LLM_MAP[config.model] ?? "gpt-4.1-mini";
  const fullPrompt = buildAgentPrompt(config);
  const placeholders = [
    ...extractPlaceholders(config.firstMessage ?? ""),
    ...extractPlaceholders(fullPrompt),
  ];
  const dynamicVariablePlaceholders = {};
  for (const name of placeholders) {
    dynamicVariablePlaceholders[name] = "";
  }

  const clientEvents =
    config.clientEvents && config.clientEvents.length > 0
      ? config.clientEvents
      : DEFAULT_CLIENT_EVENTS;

  return {
    conversation: {
      client_events: clientEvents,
    },
    turn: {
      turn_eagerness: "eager",
      speculative_turn: true,
    },
    agent: {
      first_message: config.firstMessage || undefined,
      language: "en",
      ...(Object.keys(dynamicVariablePlaceholders).length > 0 && {
        dynamic_variables: {
          dynamic_variable_placeholders: dynamicVariablePlaceholders,
        },
      }),
      prompt: {
        prompt: fullPrompt,
        llm,
        temperature: config.temperature,
        tools: [
          {
            type: "system",
            name: "language_detection",
            description:
              "Detect the user's language. Prefer responding in Hinglish (natural mix of Hindi and English). Only switch to mostly Hindi or mostly English if the user clearly insists on one language.",
            params: { system_tool_type: "language_detection" },
          },
          {
            type: "system",
            name: "end_call",
            description:
              "End the call. Use ONLY after you have followed the full Call End section in your prompt: (1) ask if the ticket may be marked resolved, (2) if the customer declines or is not satisfied, inform them the case will be reassigned to a human executive within 24 hours and they will be contacted within 24–48 hours, then say a brief closing. After completing that flow, call this tool to end the conversation.",
            params: { system_tool_type: "end_call" },
          },
        ],
      },
    },
    language_presets: {
      en: { overrides: { agent: { language: "en" } } },
      hi: { overrides: { agent: { language: "hi" } } },
    },
    tts: {
      model_id: "eleven_multilingual_v2",
      ...(config.elevenlabsVoiceId && { voice_id: config.elevenlabsVoiceId }),
      ...(config.ttsSpeed != null && Number(config.ttsSpeed) === config.ttsSpeed && { speed: Math.min(1.2, Math.max(0.5, config.ttsSpeed)) }),
    },
  };
}

/**
 * Create or update an ElevenLabs Conversational AI agent.
 * @returns {{ ok: true, agentId: string, created: boolean } | { ok: false, error: string }}
 */
async function syncAgentToElevenLabs(config, apiKey) {
  const client = new ElevenLabsClient({ apiKey });
  const conversationConfig = buildConversationConfig(config);
  const displayName = config.name || config.slug || config.agentId;

  try {
    if (config.elevenlabsAgentId) {
      await client.conversationalAi.updateAgent(config.elevenlabsAgentId, {
        conversation_config: conversationConfig,
        name: displayName,
      });
      return { ok: true, agentId: config.elevenlabsAgentId, created: false };
    }

    const created = await client.conversationalAi.createAgent({
      conversation_config: conversationConfig,
      name: displayName,
      tags: ["sentinel", "synced"],
    });

    const agentId = created.agent_id;
    if (!agentId) {
      return { ok: false, error: "ElevenLabs did not return an agent_id" };
    }
    return { ok: true, agentId, created: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`ElevenLabs sync error: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Get a signed WebSocket URL for real-time voice testing.
 */
async function getSignedUrl(elevenlabsAgentId, apiKey) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${elevenlabsAgentId}`,
    { headers: { "xi-api-key": apiKey } }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs signed URL error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.signed_url;
}

/**
 * Start an outbound phone call via ElevenLabs + Twilio.
 */
async function startOutboundCall({ apiKey, agentId, agentPhoneNumberId, toNumber, dynamicVariables }) {
  const to = (toNumber || "").trim().replace(/\s+/g, "");
  if (!to) return { ok: false, error: "Phone number is required" };

  try {
    const client = new ElevenLabsClient({ apiKey });
    const body = {
      agent_id: agentId,
      agent_phone_number_id: agentPhoneNumberId,
      to_number: to,
    };
    if (dynamicVariables && Object.keys(dynamicVariables).length > 0) {
      body.conversation_initiation_client_data = {
        dynamic_variables: dynamicVariables,
      };
    }

    const res = await client.conversationalAi.twilioOutboundCall(body);
    logger.info(`Outbound call response: ${JSON.stringify(res)}`);
    const callSid = res.callSid || res.call_sid || res.sid || null;
    return { ok: true, callSid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Outbound call error: ${msg}`);
    return { ok: false, error: msg };
  }
}

module.exports = { syncAgentToElevenLabs, getSignedUrl, startOutboundCall, buildConversationConfig };
