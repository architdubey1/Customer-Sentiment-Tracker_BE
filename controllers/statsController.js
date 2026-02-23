const Feedback = require("../database/models/Feedback");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const getDashboard = asyncHandler(async (_req, res) => {
  const [
    total,
    sentimentBreakdown,
    priorityBreakdown,
    dailyTrend,
    topComplainters,
    sourceBreakdown,
  ] = await Promise.all([
    Feedback.countDocuments(),

    Feedback.aggregate([
      { $group: { _id: "$sentiment", count: { $sum: 1 }, avgScore: { $avg: "$score" } } },
      { $sort: { count: -1 } },
    ]),

    Feedback.aggregate([
      { $group: { _id: "$priorityLevel", count: { $sum: 1 }, avgScore: { $avg: "$priorityScore" } } },
      { $sort: { avgScore: -1 } },
    ]),

    Feedback.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          avgScore: { $avg: "$score" },
          negative: { $sum: { $cond: [{ $eq: ["$sentiment", "negative"] }, 1, 0] } },
          positive: { $sum: { $cond: [{ $eq: ["$sentiment", "positive"] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ["$priorityLevel", "critical"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    Feedback.aggregate([
      { $match: { sentiment: { $in: ["negative", "mixed"] }, senderEmail: { $ne: null } } },
      { $group: { _id: "$senderEmail", count: { $sum: 1 }, avgScore: { $avg: "$score" }, latestName: { $last: "$senderName" } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),

    Feedback.aggregate([
      { $group: { _id: "$source", count: { $sum: 1 } } },
    ]),
  ]);

  const sentiments = {};
  for (const s of sentimentBreakdown) {
    sentiments[s._id] = {
      count: s.count,
      percentage: total > 0 ? Math.round((s.count / total) * 100) : 0,
      avgScore: Math.round(s.avgScore * 100) / 100,
    };
  }

  const priorities = {};
  for (const p of priorityBreakdown) {
    priorities[p._id] = {
      count: p.count,
      percentage: total > 0 ? Math.round((p.count / total) * 100) : 0,
      avgPriorityScore: Math.round(p.avgScore),
    };
  }

  const sources = {};
  for (const s of sourceBreakdown) {
    sources[s._id || "api"] = s.count;
  }

  sendSuccess(res, {
    message: "Dashboard stats retrieved",
    data: {
      total,
      sentiments,
      priorities,
      sources,
      dailyTrend,
      topComplainters: topComplainters.map((c) => ({
        email: c._id,
        name: c.latestName || "",
        feedbackCount: c.count,
        avgScore: Math.round(c.avgScore * 100) / 100,
      })),
    },
  });
});

module.exports = { getDashboard };
