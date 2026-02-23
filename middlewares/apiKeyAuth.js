const HTTP_STATUS = require("../constants/httpStatus");
const { sendError } = require("../utils/response");

const apiKeyAuth = (req, res, next) => {
  const apiKey = process.env.API_KEY;

  if (!apiKey) return next();

  const provided = req.headers["x-api-key"];

  if (!provided || provided !== apiKey) {
    return sendError(res, {
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      message: "Invalid or missing API key",
    });
  }

  next();
};

module.exports = apiKeyAuth;
