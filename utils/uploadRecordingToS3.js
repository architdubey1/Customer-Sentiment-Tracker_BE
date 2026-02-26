/**
 * Download recording from sourceUrl (e.g. Twilio) and upload to S3.
 * Returns the S3 key.
 */
const { uploadToS3 } = require("../config/s3");
const logger = require("../logs/logger");

/**
 * @param {string} url
 * @param {{ headers?: Record<string, string> }} [options]
 */
async function downloadFromUrl(url, options = {}) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: options.headers || {},
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "audio/mpeg";
  return { buffer, contentType };
}

/**
 * @param {string} chatId - Chat document _id (for S3 key path)
 * @param {string} sourceUrl - URL of the recording (e.g. Twilio recording URL)
 * @param {{ headers?: Record<string, string> }} [options] - Optional headers (e.g. Authorization for Twilio)
 * @returns {Promise<string>} S3 key
 */
async function uploadRecordingFromUrl(chatId, sourceUrl, options = {}) {
  const { buffer, contentType } = await downloadFromUrl(sourceUrl, options);
  const ext = contentType.includes("wav") ? "wav" : "mp3";
  const key = `recordings/${chatId}.${ext}`;
  await uploadToS3(key, buffer, contentType);
  logger.info(`Uploaded recording to S3: ${key}`);
  return key;
}

/**
 * Build Twilio recording URL and download with Basic auth, then upload to S3.
 * Requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in env.
 */
async function uploadTwilioRecordingToS3(chatId, recordingSid) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN required for Twilio recording download");
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return uploadRecordingFromUrl(chatId, url, {
    headers: { Authorization: `Basic ${auth}` },
  });
}

module.exports = { uploadRecordingFromUrl, uploadTwilioRecordingToS3 };
