const crypto = require("crypto");

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

/**
 * Hash a plaintext password with a random salt (for storing in DB).
 * @param {string} password - Plain password
 * @returns {string} "saltHex:hashHex"
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Verify a plain password against a stored "salt:hash" value.
 * @param {string} password - Plain password
 * @param {string} saltHash - Stored value from hashPassword()
 * @returns {boolean}
 */
function verifyPassword(password, saltHash) {
  const parts = saltHash.split(":");
  if (parts.length !== 2) return false;
  const [saltHex, storedHashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return crypto.timingSafeEqual(Buffer.from(storedHashHex, "hex"), hash);
}

module.exports = { hashPassword, verifyPassword };
