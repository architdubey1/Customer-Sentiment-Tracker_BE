const { Router } = require("express");
const { analyze, getAll, getById, getPriorityQueue, updateFeedback } = require("../controllers/sentimentController");
const validate = require("../middlewares/validator");
const { feedbackSchema } = require("../validators/feedbackValidator");
const requireAuth = require("../middlewares/requireAuth");

const router = Router();

router.post("/analyze", validate(feedbackSchema), analyze);
router.get("/priority", getPriorityQueue);
router.get("/", getAll);
router.get("/:id", getById);
router.patch("/:id", requireAuth, updateFeedback);

module.exports = router;
