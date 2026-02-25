const geminiModel = require("../config/gemini");
const { SENTIMENT_TYPES } = require("../constants/sentiments");
const { URGENCY_LEVELS, ISSUE_CATEGORIES } = require("../constants/priority");
const logger = require("../logs/logger");

const VALID_CATEGORIES = Object.values(ISSUE_CATEGORIES);

const SYSTEM_PROMPT = `You are a customer support sentiment and urgency analysis engine. Analyze the given customer feedback text and respond ONLY with valid JSON — no markdown, no code fences, no extra text.

Response format:
{
  "sentiment": "<positive|negative|neutral|mixed>",
  "score": <float between -1.0 and 1.0>,
  "urgency": "<critical|high|moderate|low>",
  "keywords": ["<matched issue keywords>"],
  "issueCategory": "<missing_item|damaged|refund|replacement|cancellation|billing|late_delivery|wrong_item|account_issue|fraud|poor_service|other>"
}

Scoring guide:
- 1.0  = extremely positive
- 0.5  = moderately positive
- 0.0  = neutral
- -0.5 = moderately negative
- -1.0 = extremely negative

For "mixed" sentiment use a score reflecting the dominant leaning.

Urgency guide:
- critical: customer threatens legal action, demands immediate refund, mentions fraud/scam, missing orders, safety issues, or is about to churn
- high: strong dissatisfaction, mentions switching to competitor, repeated complaints, unacceptable service, missing items
- moderate: general disappointment, delayed responses, unmet expectations, still waiting
- low: minor feedback, suggestions, neutral or positive comments

Issue category guide (pick the single best match):
- missing_item: order or items never arrived, package lost, missing from delivery
- damaged: product arrived broken, defective, or physically damaged
- refund: customer requesting money back, refund not processed
- replacement: customer wants a replacement or exchange for a product
- cancellation: customer wants to cancel an order, subscription, or service
- billing: overcharged, double charged, billing errors, payment disputes
- late_delivery: shipping delays, delivery took too long, still waiting for delivery
- wrong_item: received incorrect product, wrong size/color/model
- account_issue: login problems, account locked, password reset, access denied
- fraud: suspected scam, unauthorized charges, identity theft concerns
- poor_service: bad customer support experience, rude staff, no response, slow resolution
- other: doesn't fit any above category, or positive/neutral general feedback

Keywords: extract specific issue keywords from the text such as "refund", "cancel", "missing items", "missing order", "wrong item", "broken", "damaged", "late delivery", "no response", "overcharged", "billing issue", "account locked", "lawsuit", "lawyer", "competitor", "switching", "scam", "fraud", etc. Return an empty array if no issue keywords are found.`;

const analyzeSentiment = async (text) => {
  try {
    const result = await geminiModel.generateContent([
      SYSTEM_PROMPT,
      `Analyze this feedback:\n"""${text}"""`,
    ]);

    const raw = result.response.text().trim();
    const parsed = JSON.parse(raw);

    const sentiment = Object.values(SENTIMENT_TYPES).includes(parsed.sentiment)
      ? parsed.sentiment
      : SENTIMENT_TYPES.NEUTRAL;

    const score = Math.max(-1, Math.min(1, Number(parsed.score) || 0));

    const urgency = Object.values(URGENCY_LEVELS).includes(parsed.urgency)
      ? parsed.urgency
      : URGENCY_LEVELS.LOW;

    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean)
      : [];

    const issueCategory = VALID_CATEGORIES.includes(parsed.issueCategory)
      ? parsed.issueCategory
      : "other";

    return { sentiment, score, urgency, keywords, issueCategory };
  } catch (error) {
    logger.error(`Gemini analysis failed: ${error.message}`);
    throw Object.assign(new Error("Sentiment analysis service unavailable"), {
      statusCode: 503,
    });
  }
};

module.exports = { analyzeSentiment };
