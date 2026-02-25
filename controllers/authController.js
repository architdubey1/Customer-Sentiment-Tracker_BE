const User = require("../database/models/User");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess, sendError } = require("../utils/response");
const HTTP_STATUS = require("../constants/httpStatus");
const { verifyPassword } = require("../utils/passwordHash");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "css-dashboard-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return sendError(res, {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: "Username and password are required",
    });
  }

  const user = await User.findOne({ username: username.trim().toLowerCase() }).select("+passwordHash");
  if (!user) {
    return sendError(res, {
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      message: "Invalid username or password",
    });
  }

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) {
    return sendError(res, {
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      message: "Invalid username or password",
    });
  }

  const token = jwt.sign(
    { userId: user._id.toString(), username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  sendSuccess(res, {
    statusCode: HTTP_STATUS.OK,
    message: "Login successful",
    data: {
      token,
      user: { username: user.username },
      expiresIn: JWT_EXPIRES_IN,
    },
  });
});

module.exports = { login };
