const { gmail } = require("../config/gmail");
const logger = require("../logs/logger");

async function sendCriticalAlert(feedback) {
  logger.warn(
    `CRITICAL ALERT: Priority ${feedback.priorityScore}/100 from ${feedback.senderEmail} — "${feedback.emailSubject || "No subject"}"`
  );

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `:rotating_light: *Critical Customer Alert*\n*From:* ${feedback.senderEmail}\n*Subject:* ${feedback.emailSubject || "N/A"}\n*Sentiment:* ${feedback.sentiment} (${feedback.score})\n*Priority:* ${feedback.priorityScore}/100\n*Keywords:* ${feedback.urgencyKeywords?.join(", ") || "none"}`,
        }),
      });
      logger.info(`Slack alert sent for message ${feedback.gmailMessageId}`);
    } catch (error) {
      logger.error(`Slack alert failed: ${error.message}`);
    }
  }
}

async function sendAutoReply(feedback) {
  if (!process.env.AUTO_REPLY_ENABLED || process.env.AUTO_REPLY_ENABLED !== "true") return;
  if (!feedback.gmailMessageId || !feedback.senderEmail) return;

  try {
    const { data: original } = await gmail.users.messages.get({
      userId: "me",
      id: feedback.gmailMessageId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "Subject"],
    });

    const headers = original.payload.headers;
    const messageId = headers.find((h) => h.name === "Message-ID")?.value || "";
    const subject = headers.find((h) => h.name === "Subject")?.value || "";

    const replyBody = [
      `Dear ${feedback.senderName || "Customer"},`,
      "",
      "Thank you for reaching out. We've received your message and it has been flagged as a high-priority concern.",
      "",
      "Our support team has been notified and will get back to you as soon as possible. We take your feedback very seriously.",
      "",
      "If this is urgent, please don't hesitate to reply to this email with additional details.",
      "",
      "Best regards,",
      "Customer Support Team",
    ].join("\n");

    const rawMessage = [
      `To: ${feedback.senderEmail}`,
      `Subject: Re: ${subject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      replyBody,
    ].join("\n");

    const encoded = Buffer.from(rawMessage)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encoded,
        threadId: original.threadId,
      },
    });

    logger.info(`Auto-reply sent to ${feedback.senderEmail} for message ${feedback.gmailMessageId}`);
  } catch (error) {
    logger.error(`Auto-reply failed for ${feedback.gmailMessageId}: ${error.message}`);
  }
}

module.exports = { sendCriticalAlert, sendAutoReply };
