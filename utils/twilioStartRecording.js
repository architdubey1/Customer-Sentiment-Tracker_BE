/**
 * Twilio support call recording: start a recording on a live call using the
 * official Twilio Node SDK. Option 3 – wait until call is in-progress before
 * starting recording (client.calls(callSid).fetch() then check status).
 *
 * @see https://www.twilio.com/docs/voice/api/recording#create-a-recording
 * @see https://www.twilio.com/docs/node/install
 *
 * Optional: recordingStatusCallback (our /webhooks/twilio-recording) so Twilio
 * POSTs when the recording is completed; we then download and store in S3.
 */
const twilio = require("twilio");
const logger = require("../logs/logger");

const POLL_INTERVAL_MS = 1000;
const MAX_WAIT_MS = 20000;

/**
 * Wait until the call status is "in-progress", then start recording.
 * @param {string} callSid - Twilio Call SID (e.g. from ElevenLabs response)
 * @param {string} [recordingStatusCallback] - Optional URL for Twilio to POST when recording is completed
 * @returns {Promise<{ ok: boolean, recordingSid?: string, error?: string }>}
 */
async function startTwilioRecording(callSid, recordingStatusCallback) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN required" };
  }
  if (!callSid || !callSid.startsWith("CA")) {
    return { ok: false, error: "Valid Twilio Call SID required" };
  }

  const client = twilio(accountSid, authToken);

  try {
    // Option 3: check status before starting recording – make sure status is "in-progress"
    const deadline = Date.now() + MAX_WAIT_MS;
    let call;
    while (Date.now() < deadline) {
      call = await client.calls(callSid).fetch();
      if (call.status === "in-progress") {
        break;
      }
      if (call.status === "completed" || call.status === "busy" || call.status === "failed" || call.status === "no-answer" || call.status === "canceled") {
        return { ok: false, error: `Call no longer active (status: ${call.status})` };
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    if (!call || call.status !== "in-progress") {
      return { ok: false, error: `Call not in-progress after ${MAX_WAIT_MS / 1000}s (status: ${call?.status ?? "unknown"})` };
    }

    const createParams = {
      recordingChannels: "mono",
      trim: "do-not-trim",
    };
    if (recordingStatusCallback) {
      createParams.recordingStatusCallback = recordingStatusCallback;
      createParams.recordingStatusCallbackEvent = ["completed"];
      createParams.recordingStatusCallbackMethod = "POST";
    }

    const recording = await client
      .calls(callSid)
      .recordings.create(createParams);

    const recordingSid = recording.sid;
    logger.info(`Twilio recording started for call ${callSid}, RecordingSid: ${recordingSid}`);
    return { ok: true, recordingSid };
  } catch (err) {
    const msg = err.message || String(err);
    logger.warn(`Twilio start recording failed for ${callSid}: ${msg}`);
    return { ok: false, error: msg };
  }
}

module.exports = { startTwilioRecording };
