const Customer = require("../database/models/Customer");
const Feedback = require("../database/models/Feedback");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");
const HTTP_STATUS = require("../constants/httpStatus");

const getAll = asyncHandler(async (req, res) => {
  const { sortBy = "createdAt", search, page = 1, limit = 20 } = req.query;

  const filter = {};
  if (search) filter.email = { $regex: search.trim(), $options: "i" };

  const sortOptions =
    sortBy === "sentiment"
      ? { avgSentimentScore: 1 }
      : sortBy === "feedback"
        ? { feedbackCount: -1 }
        : { createdAt: -1 };

  const skip = (Number(page) - 1) * Number(limit);

  const [results, total] = await Promise.all([
    Customer.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit))
      .select("-__v"),
    Customer.countDocuments(filter),
  ]);

  sendSuccess(res, {
    message: "Customers retrieved",
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
  const customer = await Customer.findOne({
    $or: [{ _id: req.params.id }, { customerId: req.params.id }],
  }).select("-__v");

  if (!customer) {
    const err = new Error("Customer not found");
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const feedbackHistory = await Feedback.find({ senderEmail: customer.email })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("-__v");

  sendSuccess(res, {
    message: "Customer retrieved",
    data: { customer, feedbackHistory },
  });
});

const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({
    $or: [{ _id: req.params.id }, { customerId: req.params.id }],
  });

  if (!customer) {
    const err = new Error("Customer not found");
    err.statusCode = HTTP_STATUS.NOT_FOUND;
    throw err;
  }

  const { phone, name } = req.body;
  if (phone !== undefined) customer.phone = phone;
  if (name !== undefined) customer.name = name;
  await customer.save();

  sendSuccess(res, { message: "Customer updated", data: customer });
});

module.exports = { getAll, getById, updateCustomer };
