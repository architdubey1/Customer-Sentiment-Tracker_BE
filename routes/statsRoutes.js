const { Router } = require("express");
const { getDashboard } = require("../controllers/statsController");

const router = Router();

router.get("/", getDashboard);

module.exports = router;
