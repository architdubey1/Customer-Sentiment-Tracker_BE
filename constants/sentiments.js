const SENTIMENT_TYPES = Object.freeze({
  POSITIVE: "positive",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
  MIXED: "mixed",
});

const SENTIMENT_LABELS = Object.freeze(
  Object.values(SENTIMENT_TYPES)
);

module.exports = { SENTIMENT_TYPES, SENTIMENT_LABELS };
