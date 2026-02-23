const HTTP_STATUS = require("../constants/httpStatus");
const logger = require("../logs/logger");
const { sendError } = require("../utils/response");

const notFoundHandler = (req, res, _next) => {
  sendError(res, {
    statusCode: HTTP_STATUS.NOT_FOUND,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

const globalErrorHandler = (err, _req, res, _next) => {
  logger.error(err);

  if (err.name === "ValidationError") {
    return sendError(res, {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: "Validation failed",
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  if (err.name === "MongoServerError" && err.code === 11000) {
    return sendError(res, {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: "Duplicate field value",
    });
  }

  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";

  sendError(res, { statusCode, message });
};

module.exports = { notFoundHandler, globalErrorHandler };
