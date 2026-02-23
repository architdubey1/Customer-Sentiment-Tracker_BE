const { scanEmails } = require("../tools/mailScanner");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/response");

const triggerScan = asyncHandler(async (req, res) => {
  const maxResults = Math.min(Number(req.query.limit) || 10, 50);

  const { processed, results } = await scanEmails({ maxResults });

  sendSuccess(res, {
    message: `Mail scan complete — ${processed} email(s) analyzed`,
    data: { processed, results },
  });
});

module.exports = { triggerScan };
