const Feedback = require("../database/models/Feedback");
const {
  PRIORITY_LEVELS,
  PRIORITY_THRESHOLDS,
  PRIORITY_WEIGHTS,
  URGENCY_LEVELS,
} = require("../constants/priority");

const URGENCY_SCORE_MAP = {
  [URGENCY_LEVELS.CRITICAL]: 100,
  [URGENCY_LEVELS.HIGH]: 70,
  [URGENCY_LEVELS.MODERATE]: 40,
  [URGENCY_LEVELS.LOW]: 0,
};

function calcSeverity(score) {
  return Math.round(((1 - score) / 2) * 100);
}

async function calcFrequency(senderEmail) {
  if (!senderEmail) return 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recentNegativeCount = await Feedback.countDocuments({
    senderEmail,
    sentiment: { $in: ["negative", "mixed"] },
    createdAt: { $gte: sevenDaysAgo },
  });

  return Math.min(recentNegativeCount * 20, 100);
}

async function calcTrend(senderEmail, currentScore) {
  if (!senderEmail) return 0;

  const history = await Feedback.find({ senderEmail })
    .sort({ createdAt: -1 })
    .limit(10)
    .select("score")
    .lean();

  if (history.length < 2) return 0;

  const avgScore =
    history.reduce((sum, fb) => sum + fb.score, 0) / history.length;

  const delta = avgScore - currentScore;
  return Math.min(Math.max(Math.round(delta * 100), 0), 100);
}

function calcUrgency(urgencyLevel) {
  return URGENCY_SCORE_MAP[urgencyLevel] ?? 0;
}

function getPriorityLevel(priorityScore) {
  if (priorityScore >= PRIORITY_THRESHOLDS.CRITICAL) return PRIORITY_LEVELS.CRITICAL;
  if (priorityScore >= PRIORITY_THRESHOLDS.HIGH) return PRIORITY_LEVELS.HIGH;
  if (priorityScore >= PRIORITY_THRESHOLDS.MEDIUM) return PRIORITY_LEVELS.MEDIUM;
  return PRIORITY_LEVELS.LOW;
}

async function calculatePriority({ score, urgency, senderEmail }) {
  const severity = calcSeverity(score);
  const frequencyScore = await calcFrequency(senderEmail);
  const urgencyScore = calcUrgency(urgency);
  const trendScore = await calcTrend(senderEmail, score);

  const priorityScore = Math.round(
    PRIORITY_WEIGHTS.SEVERITY * severity +
    PRIORITY_WEIGHTS.FREQUENCY * frequencyScore +
    PRIORITY_WEIGHTS.URGENCY * urgencyScore +
    PRIORITY_WEIGHTS.TREND * trendScore
  );

  const clampedScore = Math.min(Math.max(priorityScore, 0), 100);
  const priorityLevel = getPriorityLevel(clampedScore);

  return {
    priorityScore: clampedScore,
    priorityLevel,
    breakdown: { severity, frequencyScore, urgencyScore, trendScore },
  };
}

module.exports = { calculatePriority };
