const router = require("express").Router();
const requireAuth = require("../middlewares/requireAuth");
const ctrl = require("../controllers/voiceAgentController");

router.use(requireAuth);

router.get("/", ctrl.listAgents);
router.get("/:id", ctrl.getAgent);
router.post("/:id", ctrl.updateAgent);
router.post("/:id/chat", ctrl.chat);
router.post("/:id/sync-elevenlabs", ctrl.syncElevenLabs);
router.post("/:id/unlink-elevenlabs", ctrl.unlinkElevenLabs);
router.get("/:id/elevenlabs-signed-url", ctrl.getSignedUrl);
router.post("/:id/start-phone-call", ctrl.startPhoneCall);

module.exports = router;
