require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");
const logger = require("./logs/logger");
const { apiLimiter, scanLimiter } = require("./middlewares/rateLimiter");
const apiKeyAuth = require("./middlewares/apiKeyAuth");
const sentimentRoutes = require("./routes/sentimentRoutes");
const mailRoutes = require("./routes/mailRoutes");
const statsRoutes = require("./routes/statsRoutes");
const customerRoutes = require("./routes/customerRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const { notFoundHandler, globalErrorHandler } = require("./middlewares/errorHandler");
const { startPolling } = require("./tools/cronPoller");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined", { stream: logger.stream }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/auth", apiLimiter, authRoutes);
app.use("/api", apiLimiter, apiKeyAuth);
app.use("/api/sentiment", sentimentRoutes);
app.use("/api/mail", scanLimiter, mailRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/users", userRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

const start = async () => {
  await connectDB();

  if (process.env.SEED_ADMIN_USER === "true") {
    const User = require("./database/models/User");
    const { hashPassword } = require("./utils/passwordHash");
    const seedUsers = [
      { username: "admin", displayName: "Admin" },
      { username: "archit", displayName: "Archit" },
      { username: "paritosh", displayName: "Paritosh" },
      { username: "keshav", displayName: "Keshav" },
      { username: "saksham", displayName: "Saksham" },
    ];
    for (const { username, displayName } of seedUsers) {
      const exists = await User.findOne({ username });
      if (!exists) {
        await User.create({ username, displayName, passwordHash: hashPassword("password") });
        logger.info(`User seeded: ${username} (${displayName})`);
      }
    }
  }

  if (process.env.AUTOMATE_POLLING === "true") {
    const interval = Number(process.env.POLL_INTERVAL_MINUTES) || 5;
    startPolling(interval);
  } else {
    logger.info("Auto-polling disabled (set AUTOMATE_POLLING=true to enable)");
  }

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
};

start();
