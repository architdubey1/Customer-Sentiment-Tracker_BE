const VoiceAgent = require("../database/models/VoiceAgent");
const { getAgentReply } = require("../tools/voiceBotChat");
const {
  syncAgentToElevenLabs,
  getSignedUrl: fetchSignedUrl,
  startOutboundCall,
} = require("../tools/elevenLabsSync");
const logger = require("../logs/logger");

const DEFAULT_AGENT = {
  name: "Sentinel Support Agent",
  slug: "sentinel-support-agent",
  provider: "openai",
  model: "gpt-4o-mini",
  temperature: 0.7,
  firstMessage:
    "Hello! I'm the Sentinel AI support agent. How can I help you today?",
  objective:
    "Assist customers with their issues, gather details, and provide helpful solutions.",
  prompt:
    "You are Sentinel AI's voice support agent. Be friendly, professional, and concise. Help the customer resolve their issue or gather enough details to escalate.",
};

async function getOrCreateAgent(agentId) {
  let agent = await VoiceAgent.findOne({ agentId });
  if (!agent) {
    agent = await VoiceAgent.create({ agentId, ...DEFAULT_AGENT });
  }
  return agent;
}

exports.listAgents = async (_req, res) => {
  try {
    const agents = await VoiceAgent.find().sort({ updatedAt: -1 });
    res.json(agents);
  } catch (err) {
    logger.error(`listAgents error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.getAgent = async (req, res) => {
  try {
    const agent = await getOrCreateAgent(req.params.id);
    res.json(agent);
  } catch (err) {
    logger.error(`getAgent error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.updateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      "name", "slug", "provider", "model", "temperature",
      "firstMessage", "waitBeforeSpeaking", "objective", "prompt",
      "selectedTools", "libraryAccess",
      "elevenlabsVoiceId", "callEndPrompt",
      "callEndMessageType", "callEndMessage", "uninterruptibleReasons",
      "clientEvents", "ttsSpeed",
    ];

    const update = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    let agent = await VoiceAgent.findOne({ agentId: id });
    if (!agent) {
      agent = await VoiceAgent.create({ agentId: id, ...DEFAULT_AGENT, ...update });
    } else {
      Object.assign(agent, update);
      await agent.save();
    }
    res.json(agent);
  } catch (err) {
    logger.error(`updateAgent error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.chat = async (req, res) => {
  try {
    const agent = await getOrCreateAgent(req.params.id);
    const { message, history = [], context_variables } = req.body;
    if (!message) return res.status(400).json({ error: "message is required" });

    const reply = await getAgentReply(agent, message, history, context_variables);
    res.json({ response: reply });
  } catch (err) {
    logger.error(`chat error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.syncElevenLabs = async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

    const agent = await getOrCreateAgent(req.params.id);

    const configForSync = {
      ...agent.toObject(),
      id: agent.agentId,
    };

    const result = await syncAgentToElevenLabs(configForSync, apiKey);
    if (!result.ok) return res.status(500).json({ error: result.error });

    agent.elevenlabsAgentId = result.agentId;
    await agent.save();
    res.json({ agentId: result.agentId, created: result.created });
  } catch (err) {
    logger.error(`syncElevenLabs error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.unlinkElevenLabs = async (req, res) => {
  try {
    const agent = await getOrCreateAgent(req.params.id);
    agent.elevenlabsAgentId = "";
    await agent.save();
    res.json({ success: true });
  } catch (err) {
    logger.error(`unlinkElevenLabs error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.getSignedUrl = async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });

    const agent = await getOrCreateAgent(req.params.id);
    if (!agent.elevenlabsAgentId) {
      return res.status(400).json({ error: "Agent not synced to ElevenLabs yet. Sync first." });
    }

    const signedUrl = await fetchSignedUrl(agent.elevenlabsAgentId, apiKey);
    res.json({ signedUrl });
  } catch (err) {
    logger.error(`getSignedUrl error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.startPhoneCall = async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const phoneNumberId = process.env.ELEVENLABS_TWILIO_PHONE_NUMBER_ID;
    if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    if (!phoneNumberId) return res.status(500).json({ error: "ELEVENLABS_TWILIO_PHONE_NUMBER_ID not configured" });

    const agent = await getOrCreateAgent(req.params.id);
    if (!agent.elevenlabsAgentId) {
      return res.status(400).json({ error: "Agent not synced to ElevenLabs yet. Sync first." });
    }

    const { toNumber, dynamicVariables } = req.body;
    const result = await startOutboundCall({
      apiKey,
      agentId: agent.elevenlabsAgentId,
      agentPhoneNumberId: phoneNumberId,
      toNumber,
      dynamicVariables,
    });

    if (!result.ok) return res.status(500).json({ error: result.error });
    res.json(result);
  } catch (err) {
    logger.error(`startPhoneCall error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
