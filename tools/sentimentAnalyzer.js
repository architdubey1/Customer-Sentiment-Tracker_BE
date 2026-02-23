const geminiModel = require("../config/gemini");
const { SENTIMENT_TYPES } = require("../constants/sentiments");
const { URGENCY_LEVELS } = require("../constants/priority");
const logger = require("../logs/logger");

const SYSTEM_PROMPT = `You are a customer support sentiment and urgency analysis engine. Analyze the given customer feedback text and respond ONLY with valid JSON — no markdown, no code fences, no extra text.

Response format:
{
  "sentiment": "<positive|negative|neutral|mixed>",
  "score": <float between -1.0 and 1.0>,
  "urgency": "<critical|high|moderate|low>",
  "keywords": ["<matched issue keywords>"]
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

    return { sentiment, score, urgency, keywords };
  } catch (error) {
    logger.error(`Gemini analysis failed: ${error.message}`);
    throw Object.assign(new Error("Sentiment analysis service unavailable"), {
      statusCode: 503,
    });
  }
};

module.exports = { analyzeSentiment };
