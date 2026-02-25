const { gmail } = require("../config/gmail");
const { analyzeSentiment } = require("./sentimentAnalyzer");
const { calculatePriority } = require("../utils/priorityCalculator");
const { sendCriticalAlert, sendAutoReply } = require("./alertService");
const Feedback = require("../database/models/Feedback");
const Customer = require("../database/models/Customer");
const logger = require("../logs/logger");

const PROCESSED_LABEL = "ANALYZED";

async function getOrCreateLabel() {
  const { data } = await gmail.users.labels.list({ userId: "me" });
  const existing = data.labels.find((l) => l.name === PROCESSED_LABEL);
  if (existing) return existing.id;

  const { data: created } = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name: PROCESSED_LABEL,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  return created.id;
}

function extractBody(payload) {
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) {
      return Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }

    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      const html = Buffer.from(htmlPart.body.data, "base64url").toString("utf-8");
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }

    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return null;
}

function parseFrom(fromHeader) {
  const match = fromHeader.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim(), email: match[2].trim().toLowerCase() };
  }
  return { name: "", email: fromHeader.trim().toLowerCase() };
}

function getHeader(headers, name) {
  const h = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

async function scanEmails({ maxResults = 10 } = {}) {
  const labelId = await getOrCreateLabel();

  const { data: listData } = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults,
  });

  const messageIds = listData.messages || [];

  if (messageIds.length === 0) {
    logger.info("Mail scan: no unread emails found");
    return { processed: 0, results: [] };
  }

  logger.info(`Mail scan: found ${messageIds.length} unread email(s)`);

  const results = [];

  for (const { id: msgId } of messageIds) {
    try {
      const exists = await Feedback.exists({ gmailMessageId: msgId });
      if (exists) {
        logger.debug(`Mail scan: skipping already-processed message ${msgId}`);
        await markProcessed(msgId, labelId);
        continue;
      }

      const { data: msg } = await gmail.users.messages.get({
        userId: "me",
        id: msgId,
        format: "full",
      });

      const headers = msg.payload.headers;
      const from = getHeader(headers, "From");
      const subject = getHeader(headers, "Subject");
      const { name: senderName, email: senderEmail } = parseFrom(from);

      const body = extractBody(msg.payload);
      if (!body || body.trim().length < 3) {
        logger.warn(`Mail scan: empty or too-short body for message ${msgId}, skipping`);
        await markProcessed(msgId, labelId);
        continue;
      }

      const text = body.slice(0, 5000);

      const { sentiment, score, urgency, keywords, issueCategory } = await analyzeSentiment(text);

      const { priorityScore, priorityLevel } = await calculatePriority({
        score,
        urgency,
        senderEmail,
      });

      const customer = await Customer.findOneAndUpdate(
        { email: senderEmail },
        {
          $setOnInsert: { email: senderEmail },
          $set: { name: senderName || undefined, lastSentiment: sentiment, lastContactedAt: new Date() },
          $inc: { feedbackCount: 1 },
        },
        { upsert: true, new: true }
      );

      const allScores = await Feedback.find({ senderEmail }).select("score").lean();
      const totalScore = allScores.reduce((sum, f) => sum + f.score, 0) + score;
      customer.avgSentimentScore = Math.round((totalScore / (allScores.length + 1)) * 100) / 100;
      await customer.save();

      const feedback = await Feedback.create({
        text,
        sentiment,
        score,
        source: "email",
        senderEmail,
        senderName,
        gmailMessageId: msgId,
        emailSubject: subject,
        urgency,
        urgencyKeywords: keywords,
        issueCategory,
        priorityScore,
        priorityLevel,
        customer: customer._id,
      });

      if (priorityLevel === "critical" || priorityLevel === "high") {
        await sendCriticalAlert(feedback);
        if (priorityLevel === "critical") {
          await sendAutoReply(feedback);
        }
      }

      await markProcessed(msgId, labelId);

      results.push({
        id: feedback._id,
        gmailMessageId: msgId,
        senderEmail,
        senderName,
        subject,
        sentiment,
        score,
        urgency,
        urgencyKeywords: keywords,
        issueCategory,
        priorityScore,
        priorityLevel,
      });

      logger.info(
        `Mail scan: processed ${msgId} from ${senderEmail} → ${sentiment} (${score}) | priority: ${priorityLevel} (${priorityScore})`
      );
    } catch (error) {
      logger.error(`Mail scan: failed to process message ${msgId}: ${error.message}`);
    }
  }

  return { processed: results.length, results };
}

async function markProcessed(msgId, labelId) {
  await gmail.users.messages.modify({
    userId: "me",
    id: msgId,
    requestBody: {
      removeLabelIds: ["UNREAD"],
      addLabelIds: [labelId],
    },
  });
}

module.exports = { scanEmails };
