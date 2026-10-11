const { sanitizeErrorMessage } = require('../../lib/constants');
const { publishSessionUpdateFromDb } = require('./sessions.events');

const ABNORMAL_SESSION_SCAN_INTERVAL_MS = 60_000;
const DEFAULT_SESSION_ABNORMAL_AFTER_SECONDS = 21_600;
const STOP_TRANSACTION_TIMEOUT_SECONDS = 120;

async function markAbnormalSessions(db, abnormalAfterSeconds = DEFAULT_SESSION_ABNORMAL_AFTER_SECONDS) {
  if (!Number.isSafeInteger(abnormalAfterSeconds) || abnormalAfterSeconds <= 0) {
    throw new TypeError('abnormalAfterSeconds must be a positive safe integer');
  }

  const database = db || require('../../db/pool').pool;
  const result = await database.query(
    `UPDATE charging_sessions cs
     SET status = 'ABNORMAL',
         needs_review = TRUE,
         review_reason = concat_ws('; ',
           NULLIF(cs.review_reason, ''),
           CASE
             WHEN cp.last_seen_at IS NOT NULL
               AND cp.last_seen_at <= CURRENT_TIMESTAMP - make_interval(secs => $1::int)
               AND position('CHARGE_POINT_OFFLINE_TIMEOUT' IN COALESCE(cs.review_reason, '')) = 0
               THEN 'CHARGE_POINT_OFFLINE_TIMEOUT'
           END,
           CASE
             WHEN cs.remote_stop_status IN ('SENDING', 'ACCEPTED', 'ERROR', 'TIMED_OUT')
               AND cs.remote_stop_requested_at IS NOT NULL
               AND cs.remote_stop_requested_at <= CURRENT_TIMESTAMP - make_interval(secs => $2::int)
               AND position('STOP_TRANSACTION_TIMEOUT' IN COALESCE(cs.review_reason, '')) = 0
               THEN 'STOP_TRANSACTION_TIMEOUT'
           END
         ),
         updated_at = CURRENT_TIMESTAMP
     FROM charge_points cp
     WHERE cp.id = cs.charge_point_id
       AND cs.status = 'CHARGING'
       AND (
         (cp.last_seen_at IS NOT NULL
           AND cp.last_seen_at <= CURRENT_TIMESTAMP - make_interval(secs => $1::int))
         OR (
           cs.remote_stop_status IN ('SENDING', 'ACCEPTED', 'ERROR', 'TIMED_OUT')
           AND cs.remote_stop_requested_at IS NOT NULL
           AND cs.remote_stop_requested_at <= CURRENT_TIMESTAMP - make_interval(secs => $2::int)
         )
       )
     RETURNING cs.id, cs.driver_id`,
    [abnormalAfterSeconds, STOP_TRANSACTION_TIMEOUT_SECONDS]
  );

  for (const row of result.rows || []) {
    void publishSessionUpdateFromDb(row.id, { pool: database, driverId: row.driver_id });
  }
  return result;
}

function startAbnormalSessionJob({
  db,
  intervalMs = ABNORMAL_SESSION_SCAN_INTERVAL_MS,
  abnormalAfterSeconds = DEFAULT_SESSION_ABNORMAL_AFTER_SECONDS,
  logInfo = console.info,
  logError = console.error,
} = {}) {
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      const result = await markAbnormalSessions(db, abnormalAfterSeconds);
      if (result.rowCount > 0) {
        logInfo(`[Job] Marked ${result.rowCount} charging session(s) abnormal`);
      }
    } catch (error) {
      logError(`[Job] Failed to mark charging sessions abnormal: ${sanitizeErrorMessage(error?.message || error)}`);
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
  ABNORMAL_SESSION_SCAN_INTERVAL_MS,
  DEFAULT_SESSION_ABNORMAL_AFTER_SECONDS,
  STOP_TRANSACTION_TIMEOUT_SECONDS,
  markAbnormalSessions,
  startAbnormalSessionJob,
};
