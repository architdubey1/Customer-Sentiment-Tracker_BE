/**
 * Poll Twilio for new call recordings and upload to S3.
 * No webhook or public URL needed – backend calls Twilio REST API on a schedule.
 * Set TWILIO_RECORDING_POLLING=true and optionally TWILIO_RECORDING_POLL_INTERVAL_MINUTES=3
 */
const cron = require("node-cron");
const Chat = require("../database/models/Chat");
const { uploadTwilioRecordingToS3 } = require("../utils/uploadRecordingToS3");
const logger = require("../logs/logger");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

async function fetchRecordingsForCall(callSid) {
  if (!accountSid || !authToken) return { recordings: [], error: "Missing Twilio credentials" };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings.json?CallSid=${encodeURIComponent(callSid)}`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return { recordings: [], error: data.message || `Twilio ${res.status}` };
    }
    const list = Array.isArray(data) ? data : (data.recordings || []);
    return { recordings: list };
  } catch (err) {
    return { recordings: [], error: err.message };
  }
}

async function pollOnce() {
  if (!accountSid || !authToken) {
    logger.warn("Twilio recording poll: TWILIO_ACCOUNT_SID/AUTH_TOKEN not set, skipping");
    return { processed: 0, details: [], error: "Missing Twilio credentials" };
  }

  const chats = await Chat.find({
    "metadata.callSid": { $exists: true, $ne: null, $ne: "" },
    recordingS3Key: null,
  })
    .limit(20)
    .lean();

  logger.info(`Twilio recording poll: found ${chats.length} chat(s) without recording`);

  const details = [];
  let processed = 0;

  for (const chat of chats) {
    const callSid = chat.metadata?.callSid;
    if (!callSid) {
      details.push({ chatId: chat._id.toString(), callSid: null, status: "no_callSid" });
      continue;
    }
    try {
      const { recordings, error } = await fetchRecordingsForCall(callSid);
      if (error) {
        logger.warn(`Twilio recording poll: CallSid ${callSid} — ${error}`);
        details.push({ chatId: chat._id.toString(), callSid, status: "twilio_error", error });
        continue;
      }
      if (recordings.length === 0) {
        logger.info(`Twilio recording poll: CallSid ${callSid} — 0 recordings (is recording enabled on this call?)`);
        details.push({ chatId: chat._id.toString(), callSid, status: "no_recordings" });
        continue;
      }
      const recording = recordings.sort((a, b) => new Date(b.date_created || 0) - new Date(a.date_created || 0))[0];
      const recordingSid = recording.sid || recording.Sid;
      if (!recordingSid) {
        details.push({ chatId: chat._id.toString(), callSid, status: "no_sid_in_response" });
        continue;
      }
      const key = await uploadTwilioRecordingToS3(chat._id.toString(), recordingSid);
      await Chat.updateOne({ _id: chat._id }, { recordingS3Key: key, status: "completed" });
      processed++;
      logger.info(`Twilio recording poll: uploaded chat ${chat._id}, recording ${recordingSid}, S3 key ${key}`);
      details.push({ chatId: chat._id.toString(), callSid, status: "uploaded", recordingSid, s3Key: key });
    } catch (err) {
      logger.error(`Twilio recording poll: chat ${chat._id} — ${err.message}`);
      details.push({ chatId: chat._id.toString(), callSid, status: "error", error: err.message });
    }
  }

  return { processed, details };
}

let task = null;

function startTwilioRecordingPolling(intervalMinutes = 3) {
  if (task) {
    logger.warn("Twilio recording poll: already running");
    return;
  }
  if (!accountSid || !authToken) {
    logger.info("Twilio recording poll: disabled (no Twilio credentials)");
    return;
  }
  task = cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
    try {
      const result = await pollOnce();
      if (result.processed > 0) logger.info(`Twilio recording poll: ${result.processed} recording(s) uploaded`);
    } catch (err) {
      logger.error(`Twilio recording poll: ${err.message}`);
    }
  });
  logger.info(`Twilio recording poll: started (every ${intervalMinutes} min)`);
}

function stopTwilioRecordingPolling() {
  if (task) {
    task.stop();
    task = null;
    logger.info("Twilio recording poll: stopped");
  }
}

module.exports = {
  pollOnce,
  startTwilioRecordingPolling,
  stopTwilioRecordingPolling,
};
