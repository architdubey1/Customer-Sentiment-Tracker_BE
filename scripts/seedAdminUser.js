/**
 * Seeds dashboard users.
 * Run once: node scripts/seedAdminUser.js
 * Or the server will seed on startup if SEED_ADMIN_USER=true.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../database/models/User");
const { hashPassword } = require("../utils/passwordHash");
const logger = require("../logs/logger");

const SEED_USERS = [
  { username: "admin", displayName: "Admin" },
  { username: "archit", displayName: "Archit" },
  { username: "paritosh", displayName: "Paritosh" },
  { username: "keshav", displayName: "Keshav" },
  { username: "saksham", displayName: "Saksham" },
];

const DEFAULT_PASSWORD = "password";

async function seedUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (err) {
    logger.error("DB connection failed:", err.message);
    process.exit(1);
  }

  for (const { username, displayName } of SEED_USERS) {
    const existing = await User.findOne({ username });
    if (existing) {
      logger.info(`User "${username}" already exists, skipping.`);
      continue;
    }

    await User.create({
      username,
      displayName,
      passwordHash: hashPassword(DEFAULT_PASSWORD),
    });
    logger.info(`User created: "${username}" (${displayName})`);
  }

  await mongoose.disconnect();
  logger.info("Seed complete.");
}

seedUsers().catch((err) => {
  logger.error("Seed failed:", err);
  process.exit(1);
});
