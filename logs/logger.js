const path = require("path");
const winston = require("winston");

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), logFormat),
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: path.join(__dirname, "combined.log"),
    }),
  ],
});

logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
