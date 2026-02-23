const mongoose = require("mongoose");
const crypto = require("crypto");
const { encrypt, decrypt } = require("../../utils/encryption");

const customerSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      unique: true,
      default: () => `CUS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    encryptedEmail: {
      type: String,
    },
    encryptedName: {
      type: String,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    feedbackCount: {
      type: Number,
      default: 0,
    },
    avgSentimentScore: {
      type: Number,
      default: 0,
    },
    lastSentiment: {
      type: String,
      default: "neutral",
    },
    lastContactedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

customerSchema.pre("save", function (next) {
  if (this.isModified("email")) {
    this.encryptedEmail = encrypt(this.email);
  }
  if (this.isModified("name") && this.name) {
    this.encryptedName = encrypt(this.name);
  }
  next();
});

customerSchema.methods.getDecryptedEmail = function () {
  return this.encryptedEmail ? decrypt(this.encryptedEmail) : this.email;
};

customerSchema.methods.getDecryptedName = function () {
  return this.encryptedName ? decrypt(this.encryptedName) : this.name;
};

customerSchema.index({ email: 1 });
customerSchema.index({ customerId: 1 });
customerSchema.index({ avgSentimentScore: 1 });

module.exports = mongoose.model("Customer", customerSchema);
