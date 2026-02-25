const User = require("../database/models/User");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const getUsers = asyncHandler(async (_req, res) => {
  const users = await User.find().select("username displayName").sort("username").lean();

  sendSuccess(res, {
    message: "Users retrieved",
    data: users,
  });
});

module.exports = { getUsers };
