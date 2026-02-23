const { z } = require("zod");

const feedbackSchema = z.object({
  text: z
    .string({
      required_error: "Feedback text is required",
      invalid_type_error: "Feedback text must be a string",
    })
    .trim()
    .min(3, "Feedback text must be at least 3 characters")
    .max(5000, "Feedback text cannot exceed 5000 characters"),
});

module.exports = { feedbackSchema };
