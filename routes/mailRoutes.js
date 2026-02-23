const { Router } = require("express");
const { triggerScan } = require("../controllers/mailController");

const router = Router();

router.post("/scan", triggerScan);

module.exports = router;
