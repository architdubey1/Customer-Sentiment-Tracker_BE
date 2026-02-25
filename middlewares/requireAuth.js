const jwt = require("jsonwebtoken");
const HTTP_STATUS = require("../constants/httpStatus");
const { sendError } = require("../utils/response");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET environment variable is required");

/**
 * Middleware to protect routes: expects Authorization: Bearer <token>.
 * Sets req.user = { userId, username } on success.
 */
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, {
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      message: "Missing or invalid authorization header",
    });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { userId: decoded.userId, username: decoded.username };
    next();
  } catch {
    return sendError(res, {
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      message: "Invalid or expired token",
    });
  }
};

module.exports = requireAuth;
