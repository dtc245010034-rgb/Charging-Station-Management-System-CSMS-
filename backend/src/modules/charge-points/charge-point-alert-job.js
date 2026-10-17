const { sanitizeErrorMessage } = require('../../lib/constants');

const CHARGE_POINT_ALERT_INTERVAL_MS = 60_000;
const OFFLINE_ALERT_AFTER_SECONDS = 300;
const REPEATED_ERROR_COUNT = 3;
const REPEATED_ERROR_WINDOW_MINUTES = 10;

async function scanChargePointAlerts(db) {
  const database = db || require('../../db/pool').pool;
  const offline = await database.query(
    `WITH eligible AS (
       SELECT cp.id, cp.station_id, cp.code,
              EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - COALESCE(cp.last_seen_at, cp.created_at))::int AS offline_seconds
       FROM charge_points cp
       WHERE cp.status IN ('OFFLINE', 'UNKNOWN')
         AND COALESCE(cp.last_seen_at, cp.created_at)
           <= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 second')
     )
     INSERT INTO alerts (
       kind, severity, station_id, charge_point_id, message, details, dedup_key
     )
     SELECT 'CHARGE_POINT_OFFLINE', 'WARNING', eligible.station_id, eligible.id,
            'Trụ ' || eligible.code || ' đã ngoại tuyến hơn 5 phút.',
            jsonb_build_object('offline_seconds', eligible.offline_seconds),
            'charge-point:' || eligible.id::text
     FROM eligible
     ON CONFLICT (kind, dedup_key) WHERE closed_at IS NULL DO NOTHING
     RETURNING id`,
    [OFFLINE_ALERT_AFTER_SECONDS]
  );

  const repeatedErrors = await database.query(
    `WITH noisy AS (
       SELECT cp.id, cp.station_id, cp.code, COUNT(*)::int AS error_count,
              ARRAY_AGG(DISTINCT errors.error_code ORDER BY errors.error_code) AS error_codes
       FROM connector_errors errors
       JOIN connectors c ON c.id = errors.connector_id
       JOIN charge_points cp ON cp.id = c.charge_point_id
       WHERE errors.occurred_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 minute')
         AND errors.occurred_at <= CURRENT_TIMESTAMP
       GROUP BY cp.id, cp.station_id, cp.code
       HAVING COUNT(*) >= $2
     )
     INSERT INTO alerts (
       kind, severity, station_id, charge_point_id, message, details, dedup_key
     )
     SELECT 'CHARGE_POINT_REPEATED_ERRORS', 'WARNING', noisy.station_id, noisy.id,
            'Trụ ' || noisy.code || ' ghi nhận nhiều lỗi trong 10 phút.',
            jsonb_build_object(
              'error_count', noisy.error_count,
              'error_codes', noisy.error_codes,
              'window_minutes', $1::int
            ),
            'charge-point:' || noisy.id::text
     FROM noisy
     ON CONFLICT (kind, dedup_key) WHERE closed_at IS NULL DO NOTHING
     RETURNING id`,
    [REPEATED_ERROR_WINDOW_MINUTES, REPEATED_ERROR_COUNT]
  );

  return {
    offlineCount: offline.rowCount,
    repeatedErrorCount: repeatedErrors.rowCount,
  };
}

function startChargePointAlertJob({
  db,
  intervalMs = CHARGE_POINT_ALERT_INTERVAL_MS,
  logInfo = console.info,
  logError = console.error,
} = {}) {
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      const result = await scanChargePointAlerts(db);
      const created = result.offlineCount + result.repeatedErrorCount;
      if (created > 0) logInfo(`[Job] Created ${created} charge-point alert(s)`);
    } catch (error) {
      logError(`[Job] Failed to create charge-point alerts: ${sanitizeErrorMessage(error?.message || error)}`);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();

  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  CHARGE_POINT_ALERT_INTERVAL_MS,
  OFFLINE_ALERT_AFTER_SECONDS,
  REPEATED_ERROR_COUNT,
  REPEATED_ERROR_WINDOW_MINUTES,
  scanChargePointAlerts,
  startChargePointAlertJob,
};
