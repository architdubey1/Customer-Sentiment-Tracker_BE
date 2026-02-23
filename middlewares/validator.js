const { ZodError } = require("zod");
const HTTP_STATUS = require("../constants/httpStatus");
const { sendError } = require("../utils/response");

const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      const messages = error.errors.map(
        (e) => `${e.path.join(".")}: ${e.message}`
      );
      return sendError(res, {
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        message: "Validation failed",
        errors: messages,
      });
    }
    next(error);
  }
};

module.exports = validate;
