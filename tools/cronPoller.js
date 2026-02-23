const cron = require("node-cron");
const { scanEmails } = require("./mailScanner");
const logger = require("../logs/logger");

let task = null;

function startPolling(intervalMinutes = 5) {
  if (task) {
    logger.warn("Cron poller: already running");
    return;
  }

  task = cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
    logger.info("Cron poller: starting scheduled mail scan...");
    try {
      const { processed } = await scanEmails({ maxResults: 20 });
      logger.info(`Cron poller: scan complete — ${processed} email(s) analyzed`);
    } catch (error) {
      logger.error(`Cron poller: scan failed — ${error.message}`);
    }
  });

  logger.info(`Cron poller: started (every ${intervalMinutes} min)`);
}

function stopPolling() {
  if (task) {
    task.stop();
    task = null;
    logger.info("Cron poller: stopped");
  }
}

function isRunning() {
  return task !== null;
}

module.exports = { startPolling, stopPolling, isRunning };
