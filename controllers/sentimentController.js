const Feedback = require("../database/models/Feedback");
const { analyzeSentiment } = require("../tools/sentimentAnalyzer");
const { calculatePriority } = require("../utils/priorityCalculator");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const HTTP_STATUS = require("../constants/httpStatus");

const analyze = asyncHandler(async (req, res) => {
  const { text } = req.body;

  const { sentiment, score, urgency, keywords, issueCategory } = await analyzeSentiment(text);

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
    issueCategory,
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
      issueCategory: feedback.issueCategory,
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
    category,
    search,
    sortBy = "createdAt",
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};
  if (sentiment) filter.sentiment = sentiment.toLowerCase();
  if (priority) filter.priorityLevel = priority.toLowerCase();
  if (category) filter.issueCategory = category.toLowerCase();
  if (search) filter.senderEmail = { $regex: search.trim(), $options: "i" };

  const sortOptions = sortBy === "priority"
    ? { priorityScore: -1, createdAt: -1 }
    : { createdAt: -1 };

  const skip = (Number(page) - 1) * Number(limit);

  if (req.query.status) filter.status = req.query.status;
  if (req.query.assignedTo === "unassigned") {
    filter.$or = [{ assignedTo: null }, { assignedTo: { $exists: false } }];
  } else if (req.query.assignedTo) {
    filter.assignedTo = req.query.assignedTo;
  }

  const [results, total] = await Promise.all([
    Feedback.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))
      .populate("assignedTo", "username displayName")
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
  const feedback = await Feedback.findById(req.params.id)
    .populate("assignedTo", "username displayName")
    .select("-__v");

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
  const { level, category, search, status, assignedTo, limit = 20, page = 1 } = req.query;

  const filter = {
    priorityLevel: { $in: ["critical", "high"] },
  };
  if (level) filter.priorityLevel = level.toLowerCase();
  if (category) filter.issueCategory = category.toLowerCase();
  if (search) filter.senderEmail = { $regex: search.trim(), $options: "i" };
  if (status) filter.status = status;
  if (assignedTo === "unassigned") {
    filter.$or = [{ assignedTo: null }, { assignedTo: { $exists: false } }];
  } else if (assignedTo) {
    filter.assignedTo = assignedTo;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [results, total, summary, categoryBreakdown] = await Promise.all([
    Feedback.find(filter)
      .sort({ priorityScore: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("assignedTo", "username displayName")
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
    Feedback.aggregate([
      { $match: level ? { priorityLevel: level.toLowerCase() } : { priorityLevel: { $in: ["critical", "high"] } } },
      { $group: { _id: "$issueCategory", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const counts = {};
  for (const item of summary) {
    counts[item._id] = { count: item.count, avgScore: Math.round(item.avgScore) };
  }

  const categories = {};
  for (const item of categoryBreakdown) {
    categories[item._id || "other"] = item.count;
  }

  sendSuccess(res, {
    message: "Priority queue retrieved",
    data: {
      summary: counts,
      categories,
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

const updateFeedback = asyncHandler(async (req, res) => {
  const { assignedTo, status, resolutionNote } = req.body;

  const feedback = await Feedback.findById(req.params.id);
  if (!feedback) {
    const err = new Error("Feedback not found");
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  if (assignedTo !== undefined) {
    if (req.user.username !== "admin") {
      const err = new Error("Only admin can assign feedback");
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }
    feedback.assignedTo = assignedTo || null;
  }
  if (status && req.user.username !== "admin") {
    if (!feedback.assignedTo) {
      const err = new Error("Cannot change status on unassigned feedback");
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }
    if (feedback.assignedTo.toString() !== req.user.userId) {
      const err = new Error("You can only update feedback assigned to you");
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }
  }
  if (status) feedback.status = status;
  if (resolutionNote !== undefined) feedback.resolutionNote = resolutionNote;

  if (status === "resolved" && !feedback.resolvedAt) {
    feedback.resolvedAt = new Date();
  }
  if (status && status !== "resolved") {
    feedback.resolvedAt = null;
  }

  await feedback.save();

  const populated = await Feedback.findById(feedback._id)
    .populate("assignedTo", "username displayName")
    .select("-__v");

  sendSuccess(res, {
    message: "Feedback updated",
    data: populated,
  });
});

module.exports = { analyze, getAll, getById, getPriorityQueue, updateFeedback };
