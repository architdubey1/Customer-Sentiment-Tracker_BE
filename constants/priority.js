const PRIORITY_LEVELS = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
});

const PRIORITY_LABELS = Object.freeze(Object.values(PRIORITY_LEVELS));

const PRIORITY_THRESHOLDS = Object.freeze({
  CRITICAL: 75,
  HIGH: 50,
  MEDIUM: 25,
  LOW: 0,
});

const PRIORITY_WEIGHTS = Object.freeze({
  SEVERITY: 0.35,
  FREQUENCY: 0.30,
  URGENCY: 0.20,
  TREND: 0.15,
});

const URGENCY_LEVELS = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MODERATE: "moderate",
  LOW: "low",
});

const URGENCY_LABELS = Object.freeze(Object.values(URGENCY_LEVELS));

const ISSUE_CATEGORIES = Object.freeze({
  MISSING_ITEM: "missing_item",
  DAMAGED: "damaged",
  REFUND: "refund",
  REPLACEMENT: "replacement",
  CANCELLATION: "cancellation",
  BILLING: "billing",
  LATE_DELIVERY: "late_delivery",
  WRONG_ITEM: "wrong_item",
  ACCOUNT_ISSUE: "account_issue",
  FRAUD: "fraud",
  POOR_SERVICE: "poor_service",
  OTHER: "other",
});

const ISSUE_CATEGORY_LABELS = Object.freeze(Object.values(ISSUE_CATEGORIES));

module.exports = {
  PRIORITY_LEVELS,
  PRIORITY_LABELS,
  PRIORITY_THRESHOLDS,
  PRIORITY_WEIGHTS,
  URGENCY_LEVELS,
  URGENCY_LABELS,
  ISSUE_CATEGORIES,
  ISSUE_CATEGORY_LABELS,
};
