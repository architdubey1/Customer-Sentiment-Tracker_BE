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

function buildAgentPrompt(config) {
  const main = (config.prompt || "").trim();
  const callEndPrompt = (config.callEndPrompt || "").trim();
  const callEndMessage = (config.callEndMessage || "").trim();
  if (!callEndPrompt) return main;

  const closingInstruction =
    callEndMessage.length > 0
      ? `Before ending the call, say this closing message (or a short, polite, context-aware variant): "${callEndMessage}". Then use the end_call tool to end the conversation.`
      : "Before ending, say a short, polite, context-aware closing message. Then use the end_call tool to end the conversation.";
  const uninterruptible =
    config.uninterruptibleReasons?.length > 0
      ? ` Do not be interrupted when: ${config.uninterruptibleReasons.join(", ")}.`
      : "";

  return `${main}\n\n### Call End\n${callEndPrompt}${uninterruptible}\n\n${closingInstruction}`;
}

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

  return {
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
              "End the call after saying a short closing message. Use when the task is complete, the user asks to hang up, or when the Call End conditions in the prompt are met.",
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
    if (!res.success) {
      return { ok: false, error: res.message || "Outbound call failed" };
    }
    return { ok: true, callSid: res.callSid };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Outbound call error: ${msg}`);
    return { ok: false, error: msg };
  }
}

module.exports = { syncAgentToElevenLabs, getSignedUrl, startOutboundCall, buildConversationConfig };
