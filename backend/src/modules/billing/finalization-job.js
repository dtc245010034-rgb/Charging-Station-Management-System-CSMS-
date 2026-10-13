const { sanitizeErrorMessage } = require('../../lib/constants');
const { finalizeSession: finalizeSessionByDefault } = require('./finalize-session');

const BILLING_SCAN_BATCH_SIZE = 50;
const BILLING_SCAN_INTERVAL_MS = 30_000;

async function findSessionsForFinalization(
  db,
  limit = BILLING_SCAN_BATCH_SIZE,
  idleMaxWaitMinutes = 60
) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('limit must be a positive safe integer');
  }
  if (!Number.isSafeInteger(idleMaxWaitMinutes) || idleMaxWaitMinutes < 1) {
    throw new TypeError('idleMaxWaitMinutes must be a positive safe integer');
  }
  const database = db || require('../../db/pool').pool;
  return database.query(
    `SELECT id
     FROM charging_sessions
     WHERE status = 'COMPLETED'
       AND (
         billing_status IS NULL
         OR (
           billing_status = 'ERROR'
           AND (billing_next_at IS NULL OR billing_next_at <= CURRENT_TIMESTAMP)
         )
         OR (
           billing_status = 'WAITING_IDLE'
           AND billing_idle_from IS NOT NULL
           AND billing_idle_from <= CURRENT_TIMESTAMP - make_interval(mins => $2::int)
         )
       )
     ORDER BY COALESCE(billing_next_at, updated_at), id
     LIMIT $1
     FOR UPDATE SKIP LOCKED`,
    [limit, idleMaxWaitMinutes]
  );
}

function startBillingFinalizationJob({
  db,
  intervalMs = BILLING_SCAN_INTERVAL_MS,
  limit = BILLING_SCAN_BATCH_SIZE,
  idleMaxWaitMinutes = 60,
  finalizeSession = finalizeSessionByDefault,
  logInfo = console.info,
  logError = console.error,
} = {}) {
  let running = null;

  async function run() {
    if (!running) {
      running = (async () => {
        try {
          const result = await findSessionsForFinalization(db, limit, idleMaxWaitMinutes);
          let finalized = 0;
          for (const row of result.rows || []) {
            try {
              const outcome = await finalizeSession(row.id, { pool: db || null });
              if (outcome.status === 'FINAL') finalized += 1;
            } catch (error) {
              logError(`[Job] Failed to finalize session ${row.id}: ${sanitizeErrorMessage(error?.message || error)}`);
            }
          }
          if (result.rowCount > 0) {
            logInfo(`[Job] Scanned ${result.rowCount} session(s) for billing; finalized ${finalized}`);
          }
        } catch (error) {
          logError(`[Job] Failed to scan sessions for billing: ${sanitizeErrorMessage(error?.message || error)}`);
        }
      })().finally(() => { running = null; });
    }
    return running;
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  BILLING_SCAN_BATCH_SIZE,
  BILLING_SCAN_INTERVAL_MS,
  findSessionsForFinalization,
  startBillingFinalizationJob,
};
