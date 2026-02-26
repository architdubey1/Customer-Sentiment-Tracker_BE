const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const ctrl = require("../controllers/chatController");

router.use(requireAuth);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.post("/poll-recordings", ctrl.pollRecordings);
router.post("/by-call-sid/:callSid/recording", ctrl.setRecordingByCallSid);
router.get("/:id", ctrl.getById);
router.patch("/:id", ctrl.patch);
router.post("/:id/recording", ctrl.setRecording);
router.post("/:id/generate-transcript", ctrl.generateTranscript);
router.post("/:id/generate-summary", ctrl.generateSummary);

module.exports = router;
