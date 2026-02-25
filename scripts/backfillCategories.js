require("dotenv").config();

const mongoose = require("mongoose");
const Feedback = require("../database/models/Feedback");
const geminiModel = require("../config/gemini");
const { ISSUE_CATEGORIES } = require("../constants/priority");

const VALID_CATEGORIES = Object.values(ISSUE_CATEGORIES);

const CLASSIFY_PROMPT = `You are a customer support issue classifier. Given customer feedback text, respond ONLY with valid JSON — no markdown, no code fences, no extra text.

Response format:
{ "issueCategory": "<category>" }

Categories (pick the single best match):
- missing_item: order or items never arrived, package lost, missing from delivery
- damaged: product arrived broken, defective, or physically damaged
- refund: customer requesting money back, refund not processed
- replacement: customer wants a replacement or exchange for a product
- cancellation: customer wants to cancel an order, subscription, or service
- billing: overcharged, double charged, billing errors, payment disputes
- late_delivery: shipping delays, delivery took too long, still waiting for delivery
- wrong_item: received incorrect product, wrong size/color/model
- account_issue: login problems, account locked, password reset, access denied
- fraud: suspected scam, unauthorized charges, identity theft concerns
- poor_service: bad customer support experience, rude staff, no response, slow resolution
- other: doesn't fit any above category, or positive/neutral general feedback`;

async function classifyText(text) {
  const result = await geminiModel.generateContent([
    CLASSIFY_PROMPT,
    `Classify this feedback:\n"""${text}"""`,
  ]);
  const raw = result.response.text().trim();
  const parsed = JSON.parse(raw);
  return VALID_CATEGORIES.includes(parsed.issueCategory)
    ? parsed.issueCategory
    : "other";
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected.\n");

  const feedbacks = await Feedback.find({
    $or: [
      { issueCategory: { $exists: false } },
      { issueCategory: null },
      { issueCategory: "other" },
    ],
  })
    .select("_id text issueCategory")
    .lean();

  console.log(`Found ${feedbacks.length} feedback(s) to classify.\n`);

  if (feedbacks.length === 0) {
    console.log("Nothing to update. Done.");
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < feedbacks.length; i++) {
    const fb = feedbacks[i];
    const preview = fb.text?.slice(0, 60).replace(/\n/g, " ") || "(empty)";

    try {
      const category = await classifyText(fb.text);
      await Feedback.updateOne({ _id: fb._id }, { $set: { issueCategory: category } });
      updated++;
      console.log(`[${i + 1}/${feedbacks.length}] ${fb._id} → ${category}  "${preview}..."`);
    } catch (err) {
      failed++;
      console.error(`[${i + 1}/${feedbacks.length}] FAILED ${fb._id}: ${err.message}`);
    }

    // Rate-limit Gemini calls (~30 req/min for free tier)
    if (i < feedbacks.length - 1) await sleep(2000);
  }

  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
