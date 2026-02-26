const VoiceAgent = require("../database/models/VoiceAgent");
const Chat = require("../database/models/Chat");
const { getAgentReply } = require("../tools/voiceBotChat");
const {
  syncAgentToElevenLabs,
  getSignedUrl: fetchSignedUrl,
  startOutboundCall,
} = require("../tools/elevenLabsSync");
const { startTwilioRecording } = require("../utils/twilioStartRecording");
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
      logger.info(`Auto-syncing agent "${agent.agentId}" to ElevenLabs before voice test`);
      const syncResult = await syncAgentToElevenLabs(
        { ...agent.toObject(), id: agent.agentId },
        apiKey
      );
      if (!syncResult.ok) {
        return res.status(500).json({ error: `Auto-sync failed: ${syncResult.error}` });
      }
      agent.elevenlabsAgentId = syncResult.agentId;
      await agent.save();
    }

    const signedUrl = await fetchSignedUrl(agent.elevenlabsAgentId, apiKey);
    res.json({ signedUrl });
  } catch (err) {
    logger.error(`getSignedUrl error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.setDefault = async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    await VoiceAgent.updateMany({}, { isDefaultCaller: false });
    const agent = await getOrCreateAgent(req.params.id);
    agent.isDefaultCaller = true;

    if (apiKey) {
      logger.info(`Syncing agent "${agent.agentId}" to ElevenLabs on set-default`);
      const syncResult = await syncAgentToElevenLabs(
        { ...agent.toObject(), id: agent.agentId },
        apiKey
      );
      if (syncResult.ok) {
        agent.elevenlabsAgentId = syncResult.agentId;
      } else {
        logger.warn(`Sync on set-default failed: ${syncResult.error}`);
      }
    }

    await agent.save();
    res.json({ success: true, agentId: agent.agentId, elevenlabsAgentId: agent.elevenlabsAgentId });
  } catch (err) {
    logger.error(`setDefault error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.getDefault = async (_req, res) => {
  try {
    const agent = await VoiceAgent.findOne({ isDefaultCaller: true });
    res.json({ agent: agent || null });
  } catch (err) {
    logger.error(`getDefault error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.callCustomer = async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const phoneNumberId = process.env.ELEVENLABS_TWILIO_PHONE_NUMBER_ID;
    if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not configured" });
    if (!phoneNumberId) return res.status(500).json({ error: "ELEVENLABS_TWILIO_PHONE_NUMBER_ID not configured" });

    const agent = await VoiceAgent.findOne({ isDefaultCaller: true });
    if (!agent) return res.status(400).json({ error: "No default calling agent set. Go to Voice Bot and set one." });

    if (!agent.elevenlabsAgentId) {
      logger.info(`Auto-syncing default agent "${agent.agentId}" to ElevenLabs before call`);
      const syncResult = await syncAgentToElevenLabs(
        { ...agent.toObject(), id: agent.agentId },
        apiKey
      );
      if (!syncResult.ok) return res.status(500).json({ error: `Sync failed: ${syncResult.error}` });
      agent.elevenlabsAgentId = syncResult.agentId;
      await agent.save();
    }

    const { toNumber: rawNumber, dynamicVariables } = req.body;
    let toNumber = (rawNumber || "").trim().replace(/\s+/g, "");
    if (toNumber && !toNumber.startsWith("+")) {
      toNumber = "+91" + toNumber;
    }
    const chat = await Chat.create({
      agentId: agent.agentId,
      channel: "phone",
      metadata: { toNumber },
    });
    const result = await startOutboundCall({
      apiKey,
      agentId: agent.elevenlabsAgentId,
      agentPhoneNumberId: phoneNumberId,
      toNumber,
      dynamicVariables: { ...(dynamicVariables || {}), chat_id: chat._id.toString() },
    });

    if (!result.ok) {
      await Chat.findByIdAndDelete(chat._id);
      return res.status(500).json({ error: result.error });
    }
    chat.metadata = { ...(chat.metadata || {}), callSid: result.callSid };
    await chat.save();
    const callbackUrl = process.env.WEBHOOK_BASE_URL
      ? `${process.env.WEBHOOK_BASE_URL.replace(/\/$/, "")}/webhooks/twilio-recording`
      : null;
    const recordingResult = await startTwilioRecording(result.callSid, callbackUrl);
    logger.info(`callCustomer result: ${JSON.stringify(result)}`);
    if (!result.ok) return res.status(500).json({ error: result.error });
    res.json({
      ...result,
      usedAgent: agent.agentId,
      chatId: chat._id.toString(),
      recordingStarted: recordingResult.ok,
      recordingSid: recordingResult.recordingSid || null,
      recordingError: recordingResult.error || null,
    });
  } catch (err) {
    logger.error(`callCustomer error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.callStatus = async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(500).json({ error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured" });
    }

    const { callSid } = req.params;
    if (!callSid) return res.status(400).json({ error: "callSid is required" });

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
      {
        method: "GET",
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
      }
    );

    if (!twilioRes.ok) {
      const text = await twilioRes.text();
      logger.error(`Twilio call status error: ${twilioRes.status} ${text}`);
      return res.status(twilioRes.status).json({ error: "Failed to fetch call status" });
    }

    const data = await twilioRes.json();
    res.json({ callSid: data.sid, status: data.status });
  } catch (err) {
    logger.error(`callStatus error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};

exports.endCall = async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(500).json({ error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured" });
    }

    const { callSid } = req.body;
    if (!callSid) return res.status(400).json({ error: "callSid is required" });

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: "Status=completed",
      }
    );

    if (!twilioRes.ok) {
      const text = await twilioRes.text();
      logger.error(`Twilio end call error: ${twilioRes.status} ${text}`);
      return res.status(twilioRes.status).json({ error: "Failed to end call" });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error(`endCall error: ${err.message}`);
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
      logger.info(`Auto-syncing agent "${agent.agentId}" to ElevenLabs before call`);
      const syncResult = await syncAgentToElevenLabs(
        { ...agent.toObject(), id: agent.agentId },
        apiKey
      );
      if (!syncResult.ok) {
        return res.status(500).json({ error: `Auto-sync failed: ${syncResult.error}` });
      }
      agent.elevenlabsAgentId = syncResult.agentId;
      await agent.save();
    }

    const { toNumber: rawNumber, dynamicVariables } = req.body;
    let toNumber = (rawNumber || "").trim().replace(/\s+/g, "");
    if (toNumber && !toNumber.startsWith("+")) {
      toNumber = "+91" + toNumber;
    }
    const chat = await Chat.create({
      agentId: agent.agentId,
      channel: "phone",
      metadata: { toNumber },
    });
    const result = await startOutboundCall({
      apiKey,
      agentId: agent.elevenlabsAgentId,
      agentPhoneNumberId: phoneNumberId,
      toNumber,
      dynamicVariables: { ...(dynamicVariables || {}), chat_id: chat._id.toString() },
    });

    if (!result.ok) {
      await Chat.findByIdAndDelete(chat._id);
      return res.status(500).json({ error: result.error });
    }
    chat.metadata = { ...(chat.metadata || {}), callSid: result.callSid };
    await chat.save();
    const callbackUrl = process.env.WEBHOOK_BASE_URL
      ? `${process.env.WEBHOOK_BASE_URL.replace(/\/$/, "")}/webhooks/twilio-recording`
      : null;
    const recordingResult = await startTwilioRecording(result.callSid, callbackUrl);
    res.json({
      ...result,
      chatId: chat._id.toString(),
      recordingStarted: recordingResult.ok,
      recordingSid: recordingResult.recordingSid || null,
      recordingError: recordingResult.error || null,
    });
  } catch (err) {
    logger.error(`startPhoneCall error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
