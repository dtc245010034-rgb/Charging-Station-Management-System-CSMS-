const { sanitizeErrorMessage } = require('../../lib/constants');
const { publishSessionUpdateFromDb } = require('./sessions.events');

const REMOTE_STOP_SCAN_INTERVAL_MS = 5000;

async function markExpiredRemoteStops(db, { recordAudit = null } = {}) {
  const database = db || require('../../db/pool').pool;
  const result = await database.query(
    `UPDATE charging_sessions
     SET remote_stop_status = CASE WHEN remote_stop_status = 'ACCEPTED' THEN 'TIMED_OUT' ELSE 'ERROR' END,
         needs_review = TRUE,
         review_reason = CASE
           WHEN position(CASE WHEN remote_stop_status = 'ACCEPTED' THEN 'REMOTE_STOP_TIMEOUT' ELSE 'REMOTE_STOP_RESULT_UNKNOWN' END IN COALESCE(review_reason, '')) > 0 THEN review_reason
           ELSE concat_ws('; ', NULLIF(review_reason, ''), CASE WHEN remote_stop_status = 'ACCEPTED' THEN 'REMOTE_STOP_TIMEOUT' ELSE 'REMOTE_STOP_RESULT_UNKNOWN' END)
         END,
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'CHARGING'
       AND remote_stop_status IN ('SENDING', 'ACCEPTED')
       AND remote_stop_deadline <= CURRENT_TIMESTAMP
     RETURNING id, charge_point_id, driver_id, remote_stop_requested_by, remote_stop_deadline, remote_stop_status`,
  );

  for (const row of result.rows || []) {
    try {
      const writeAudit = recordAudit || require('../audit/audit.repository').record;
      await writeAudit(row.remote_stop_requested_by, 'REMOTE_STOP', 'charging_session', row.id, {
        charge_point_id: Number(row.charge_point_id),
        phase: row.remote_stop_status === 'TIMED_OUT' ? 'TIMEOUT' : 'RESULT_UNKNOWN',
        result: row.remote_stop_status,
        deadline: row.remote_stop_deadline ? new Date(row.remote_stop_deadline).toISOString() : null,
      }, null);
    } catch {
      // Timeout state is durable even if its secondary audit write must be retried operationally.
    }
    publishSessionUpdateFromDb(row.id, { pool: database, driverId: row.driver_id }).catch(() => {});
  }
  return result;
}

function startRemoteStopTimeoutJob({
  db,
  intervalMs = REMOTE_STOP_SCAN_INTERVAL_MS,
  logInfo = console.info,
  logError = console.error,
  recordAudit = null,
} = {}) {
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      const result = await markExpiredRemoteStops(db, { recordAudit });
      if (result.rowCount > 0) logInfo(`[Job] Marked ${result.rowCount} remote stop request(s) for review`);
    } catch (error) {
      logError(`[Job] Failed to mark expired remote stops: ${sanitizeErrorMessage(error?.message || error)}`);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = { REMOTE_STOP_SCAN_INTERVAL_MS, markExpiredRemoteStops, startRemoteStopTimeoutJob };