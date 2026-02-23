const Feedback = require("../database/models/Feedback");
const { analyzeSentiment } = require("../tools/sentimentAnalyzer");
const { calculatePriority } = require("../utils/priorityCalculator");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const HTTP_STATUS = require("../constants/httpStatus");

const analyze = asyncHandler(async (req, res) => {
  const { text } = req.body;

  const { sentiment, score, urgency, keywords } = await analyzeSentiment(text);

  const { priorityScore, priorityLevel } = await calculatePriority({
    score,
    urgency,
  });

  const feedback = await Feedback.create({
    text,
    sentiment,
    score,
    urgency,
    urgencyKeywords: keywords,
    priorityScore,
    priorityLevel,
  });

  sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: "Sentiment analysis complete",
    data: {
      id: feedback._id,
      text: feedback.text,
      sentiment: feedback.sentiment,
      score: feedback.score,
      urgency: feedback.urgency,
      urgencyKeywords: feedback.urgencyKeywords,
      priorityScore: feedback.priorityScore,
      priorityLevel: feedback.priorityLevel,
      timestamp: feedback.createdAt,
    },
  });
});

const getAll = asyncHandler(async (req, res) => {
  const {
    sentiment,
    priority,
    sortBy = "createdAt",
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};
  if (sentiment) filter.sentiment = sentiment.toLowerCase();
  if (priority) filter.priorityLevel = priority.toLowerCase();

  const sortOptions = sortBy === "priority"
    ? { priorityScore: -1, createdAt: -1 }
    : { createdAt: -1 };

  const skip = (Number(page) - 1) * Number(limit);

  const [results, total] = await Promise.all([
    Feedback.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))
      .select("-__v"),
    Feedback.countDocuments(filter),
  ]);

  sendSuccess(res, {
    message: "Feedback retrieved",
    data: {
      results,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    },
  });
});

const getById = asyncHandler(async (req, res) => {
  const feedback = await Feedback.findById(req.params.id).select("-__v");

  if (!feedback) {
    const err = new Error("Feedback not found");
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  sendSuccess(res, {
    message: "Feedback retrieved",
    data: feedback,
  });
});

const getPriorityQueue = asyncHandler(async (req, res) => {
  const { level, limit = 20, page = 1 } = req.query;

  const filter = {
    priorityLevel: { $in: ["critical", "high"] },
  };
  if (level) filter.priorityLevel = level.toLowerCase();

  const skip = (Number(page) - 1) * Number(limit);

  const [results, total, summary] = await Promise.all([
    Feedback.find(filter)
      .sort({ priorityScore: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select("-__v"),
    Feedback.countDocuments(filter),
    Feedback.aggregate([
      {
        $group: {
          _id: "$priorityLevel",
          count: { $sum: 1 },
          avgScore: { $avg: "$priorityScore" },
        },
      },
      { $sort: { avgScore: -1 } },
    ]),
  ]);

  const counts = {};
  for (const item of summary) {
    counts[item._id] = { count: item.count, avgScore: Math.round(item.avgScore) };
  }

  sendSuccess(res, {
    message: "Priority queue retrieved",
    data: {
      summary: counts,
      results,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    },
  });
});

module.exports = { analyze, getAll, getById, getPriorityQueue };
