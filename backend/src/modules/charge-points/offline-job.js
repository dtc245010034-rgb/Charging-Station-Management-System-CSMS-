const { sanitizeErrorMessage, CHARGE_POINT_ONLINE_STATUS, CHARGE_POINT_STALE_STATUS, CHARGE_POINT_OFFLINE_STATUS } = require('../../lib/constants');
const { publish } = require('../fleet-status/fleet-status.events');

const OFFLINE_SCAN_INTERVAL_MS = 60_000;

async function scanStaleChargePoints(db) {
  const database = db || require('../../db/pool').pool;
  const result = await database.query(
    `WITH offline AS (
       UPDATE charge_points cp
       SET status = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE cp.status = $1
         AND (
           cp.last_seen_at IS NULL
           OR cp.last_seen_at <= CURRENT_TIMESTAMP - (COALESCE(cp.heartbeat_interval, 60) * INTERVAL '2 seconds')
         )
       RETURNING cp.id, cp.station_id
     ),
     connectors_offline AS (
       UPDATE connectors c
       SET status = $3,
           updated_at = CURRENT_TIMESTAMP
       FROM offline o
       WHERE c.charge_point_id = o.id
         AND c.status <> $3
       RETURNING c.id
     )
     SELECT o.id AS charge_point_id, o.station_id, s.owner_id
     FROM offline o
     JOIN stations s ON s.id = o.station_id`,
    [CHARGE_POINT_ONLINE_STATUS, CHARGE_POINT_STALE_STATUS, CHARGE_POINT_OFFLINE_STATUS]
  );
  for (const point of result.rows || []) {
    publish({
      ownerId: point.owner_id,
      stationId: point.station_id,
      chargePointId: point.charge_point_id,
    });
  }
  return result;
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
