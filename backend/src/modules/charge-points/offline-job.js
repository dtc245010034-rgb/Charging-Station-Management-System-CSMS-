const { sanitizeErrorMessage } = require('../../lib/constants');

const OFFLINE_SCAN_INTERVAL_MS = 60_000;

async function scanStaleChargePoints(db) {
  const database = db || require('../../db/pool').pool;
  return database.query(
    `UPDATE charge_points
     SET status = 'OFFLINE',
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'ONLINE'
       AND (
         last_seen_at IS NULL
         OR last_seen_at <= CURRENT_TIMESTAMP - (heartbeat_interval * INTERVAL '2 seconds')
       )`
  );
}

function startChargePointOfflineJob({
  db,
  intervalMs = OFFLINE_SCAN_INTERVAL_MS,
  logInfo = console.info,
  logError = console.error,
} = {}) {
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      const result = await scanStaleChargePoints(db);
      if (result.rowCount > 0) {
        logInfo(`[Job] Marked ${result.rowCount} stale charge point(s) offline`);
      }
    } catch (error) {
      logError(`[Job] Failed to mark stale charge points offline: ${sanitizeErrorMessage(error?.message || error)}`);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();

  return {
    run,
    stop: () => clearInterval(timer),
  };
}

module.exports = { OFFLINE_SCAN_INTERVAL_MS, scanStaleChargePoints, startChargePointOfflineJob };
