const { pool } = require('../../db/pool');
const { sanitizeErrorMessage } = require('../../lib/constants');

const RESERVATION_PENDING_SCAN_INTERVAL_MS = 10000;

async function failStalePendingReservations(db = pool) {
  return db.query(
    `UPDATE reservations
     SET status = 'FAILED',
         reject_reason = 'PENDING_TIMEOUT',
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'PENDING'
       AND created_at <= CURRENT_TIMESTAMP - INTERVAL '60 seconds'
     RETURNING id`,
  );
}

async function expireStaleAcceptedReservations(db = pool) {
  return db.query(
    `UPDATE reservations
     SET status = 'EXPIRED',
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'ACCEPTED'
       AND expires_at <= CURRENT_TIMESTAMP
     RETURNING id, driver_id, connector_id`,
  );
}

function startReservationPendingCleanupJob({
  db = pool,
  intervalMs = RESERVATION_PENDING_SCAN_INTERVAL_MS,
  logInfo = console.info,
  logError = console.error,
} = {}) {
  let running = null;

  async function run() {
    if (running) return running;
    running = (async () => {
      try {
        const pendingResult = await failStalePendingReservations(db);
        if (pendingResult.rowCount > 0) {
          logInfo(`[Reservation cleanup] Đã chuyển ${pendingResult.rowCount} đặt chỗ PENDING quá hạn sang FAILED`);
        }
        const expiredResult = await expireStaleAcceptedReservations(db);
        if (expiredResult.rowCount > 0) {
          logInfo(`[Reservation cleanup] Đã chuyển ${expiredResult.rowCount} đặt chỗ ACCEPTED quá hạn sang EXPIRED`);
        }
        return { pending: pendingResult, expired: expiredResult };
      } catch (error) {
        logError(`[Reservation cleanup] Lỗi quét đặt chỗ: ${sanitizeErrorMessage(error?.message || error)}`);
        return null;
      }
    })().finally(() => { running = null; });
    return running;
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  RESERVATION_PENDING_SCAN_INTERVAL_MS,
  failStalePendingReservations,
  expireStaleAcceptedReservations,
  startReservationPendingCleanupJob,
};