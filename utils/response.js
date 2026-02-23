const HTTP_STATUS = require("../constants/httpStatus");

const sendSuccess = (res, { statusCode = HTTP_STATUS.OK, message = "Success", data = null }) => {
  const payload = { success: true, message };
  if (data !== null) payload.data = data;
  return res.status(statusCode).json(payload);
};

const sendError = (res, { statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, message = "Something went wrong", errors = null }) => {
  const payload = { success: false, message };
  if (errors !== null) payload.errors = errors;
  return res.status(statusCode).json(payload);
};

module.exports = { sendSuccess, sendError };
