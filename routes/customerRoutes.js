const { Router } = require("express");
const { getAll, getById, updateCustomer } = require("../controllers/customerController");
const requireAuth = require("../middlewares/requireAuth");

const router = Router();

router.get("/", getAll);
router.get("/:id", getById);
router.patch("/:id", requireAuth, updateCustomer);

module.exports = router;
