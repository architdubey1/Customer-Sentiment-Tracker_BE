/**
 * Seeds the default dashboard admin user (username: admin, password: password).
 * Run once: node scripts/seedAdminUser.js
 * Or the server will ensure admin exists on startup if SEED_ADMIN_USER=true.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../database/models/User");
const { hashPassword } = require("../utils/passwordHash");
const logger = require("../logs/logger");

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "password";

async function seedAdminUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (err) {
    logger.error("DB connection failed:", err.message);
    process.exit(1);
  }

  const existing = await User.findOne({ username: DEFAULT_ADMIN_USERNAME });
  if (existing) {
    logger.info("Admin user already exists, skipping seed.");
    await mongoose.disconnect();
    return;
  }

  const passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
  await User.create({
    username: DEFAULT_ADMIN_USERNAME,
    passwordHash,
  });
  logger.info(`Admin user created: username="${DEFAULT_ADMIN_USERNAME}", password="${DEFAULT_ADMIN_PASSWORD}" (change in production)`);
  await mongoose.disconnect();
}

seedAdminUser().catch((err) => {
  logger.error("Seed failed:", err);
  process.exit(1);
});
