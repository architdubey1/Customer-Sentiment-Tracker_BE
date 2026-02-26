const Chat = require("../database/models/Chat");
const { uploadTwilioRecordingToS3 } = require("../utils/uploadRecordingToS3");
const { generateAndSaveTranscript } = require("../utils/transcribeRecording");
const logger = require("../logs/logger");

/**
 * Twilio Recording Status Callback webhook.
 * Twilio POSTs here when a recording is completed (RecordingStatus=completed).
 * Body (form): CallSid, RecordingSid, RecordingStatus, etc.
 * Finds our Chat by metadata.callSid, downloads the recording from Twilio, uploads to S3, saves key on chat.
 */
exports.recordingStatus = async (req, res) => {
  try {
    const { CallSid, RecordingSid, RecordingStatus } = req.body;
    if (!CallSid || !RecordingSid) {
      logger.warn("Twilio webhook missing CallSid or RecordingSid");
      return res.status(400).send("Missing CallSid or RecordingSid");
    }
    if (RecordingStatus !== "completed") {
      return res.status(200).send("OK");
    }

    const chat = await Chat.findOne({ "metadata.callSid": CallSid });
    if (!chat) {
      logger.warn(`No chat found for Twilio CallSid: ${CallSid}`);
      return res.status(404).send("Chat not found");
    }

    const key = await uploadTwilioRecordingToS3(chat._id.toString(), RecordingSid);
    chat.recordingS3Key = key;
    chat.status = "completed";
    await chat.save();
    logger.info(`Twilio recording saved for chat ${chat._id}, S3 key: ${key}`);
    // Generate transcript in background (non-blocking)
    const chatId = chat._id.toString();
    generateAndSaveTranscript(chatId, Chat).catch((err) =>
      logger.warn(`Background transcript failed for ${chatId}: ${err.message}`)
    );
    res.status(200).send("OK");
  } catch (err) {
    logger.error(`Twilio recording webhook error: ${err.message}`);
    res.status(500).send("Error");
  }
};
