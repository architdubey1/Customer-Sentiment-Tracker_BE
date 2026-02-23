const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return null;
  return Buffer.from(key, "hex");
}

function encrypt(plaintext) {
  const key = getKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decrypt(ciphertext) {
  const key = getKey();
  if (!key) return ciphertext;

  const parts = ciphertext.split(":");
  if (parts.length !== 3) return ciphertext;

  const [ivHex, tagHex, encrypted] = parts;

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return ciphertext;
  }
}

function hashForLookup(value) {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

module.exports = { encrypt, decrypt, hashForLookup };
