const { pool } = require('../../db/pool');
const { withTransaction } = require('../../db/tx');
const { sanitizeErrorMessage } = require('../../lib/constants');
const { postEntry } = require('../wallet/ledger.service');

const RESERVATION_PENDING_SCAN_INTERVAL_MS = 10000;
const RESERVATION_NO_SHOW_FEE_DONG = 20000;
const RESERVATION_CALL_TIMEOUT_MS = 10000;

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

async function expireStaleAcceptedReservations(db = pool, driverId = null) {
  return withTransaction(async (client) => {
    const expired = await client.query(
      `WITH due AS (
         SELECT id
         FROM reservations
         WHERE status = 'ACCEPTED'
           AND expires_at <= clock_timestamp()
           AND ($1::bigint IS NULL OR driver_id = $1)
         ORDER BY expires_at, id
         LIMIT 100
         FOR UPDATE SKIP LOCKED
       )
       UPDATE reservations r
       SET status = 'EXPIRED', updated_at = clock_timestamp()
       FROM due
       WHERE r.id = due.id
       RETURNING r.id, r.driver_id, r.connector_id, r.ocpp_reservation_id`,
      [driverId]
    );
    for (const reservation of expired.rows) {
      await postEntry(client, {
        driverId: reservation.driver_id,
        entryType: 'RESERVATION_FEE',
        amountDong: -RESERVATION_NO_SHOW_FEE_DONG,
        reservationId: reservation.id,
        reason: 'RESERVATION_NO_SHOW',
        allowLocked: true,
      });
      await client.query(
        `INSERT INTO reservation_cancellation_queue (reservation_id)
         VALUES ($1) ON CONFLICT (reservation_id) DO NOTHING`,
        [reservation.id]
      );
    }
    return expired;
  }, db);
}

async function dispatchReservationCancellation(db, commandSender, reservationId, {
  logError = console.error,
} = {}) {
  if (!commandSender) throw new TypeError('commandSender is required to send CancelReservation');
  const claim = await withTransaction(async (client) => {
    const claimed = await client.query(
      `UPDATE reservation_cancellation_queue
       SET attempts = attempts + 1,
           next_attempt_at = clock_timestamp() + INTERVAL '60 seconds',
           updated_at = clock_timestamp()
       WHERE reservation_id = $1
         AND status = 'PENDING'
         AND next_attempt_at <= clock_timestamp()
       RETURNING reservation_id`,
      [reservationId]
    );
    if (!claimed.rowCount) return null;
    const detail = await client.query(
      `SELECT r.ocpp_reservation_id, cp.code AS charge_point_code
       FROM reservations r
       JOIN connectors c ON c.id = r.connector_id
       JOIN charge_points cp ON cp.id = c.charge_point_id
       WHERE r.id = $1`,
      [reservationId]
    );
    if (!detail.rows[0]) throw new Error(`Reservation ${reservationId} has no charge point`);
    return detail.rows[0];
  }, db);
  if (!claim) {
    const current = await db.query(
      'SELECT status FROM reservation_cancellation_queue WHERE reservation_id = $1',
      [reservationId]
    );
    return current.rows[0]?.status || null;
  }

  let status;
  let failure = null;
  try {
    const response = await commandSender.send(
      claim.charge_point_code,
      'CancelReservation',
      { reservationId: claim.ocpp_reservation_id },
      { timeoutMs: RESERVATION_CALL_TIMEOUT_MS }
    );
    if (response?.status === 'Accepted') status = 'SENT';
    else if (response?.status === 'Rejected') status = 'REJECTED';
    else throw new Error(`Invalid CancelReservation response: ${response?.status}`);
  } catch (error) {
    failure = sanitizeErrorMessage(error?.message || error);
  }

  if (failure) {
    await db.query(
      `UPDATE reservation_cancellation_queue
       SET next_attempt_at = clock_timestamp()
             + make_interval(secs => LEAST(300, 15 * (1 << LEAST(attempts, 4)))),
           last_error = $2,
           updated_at = clock_timestamp()
       WHERE reservation_id = $1 AND status = 'PENDING'`,
      [reservationId, failure]
    );
    logError(`[Reservation cleanup] CancelReservation ${reservationId} failed:`, failure);
    return 'PENDING';
  }

  await db.query(
    `UPDATE reservation_cancellation_queue
     SET status = $2, last_error = $3, sent_at = clock_timestamp(), updated_at = clock_timestamp()
     WHERE reservation_id = $1 AND status = 'PENDING'`,
    [reservationId, status, status === 'REJECTED' ? 'OCPP_REJECTED' : null]
  );
  return status;
}

async function dispatchPendingReservationCancellations(db, commandSender, { logError = console.error } = {}) {
  const pending = await db.query(
    `SELECT reservation_id
     FROM reservation_cancellation_queue
     WHERE status = 'PENDING' AND next_attempt_at <= clock_timestamp()
     ORDER BY next_attempt_at, reservation_id
     LIMIT 50`
  );
  const results = [];
  for (const { reservation_id: reservationId } of pending.rows) {
    try {
      results.push(await dispatchReservationCancellation(db, commandSender, reservationId, { logError }));
    } catch (error) {
      logError(
        `[Reservation cleanup] CancelReservation ${reservationId} could not be dispatched:`,
        sanitizeErrorMessage(error?.message || error)
      );
    }
  }
  return results;
}

function startReservationPendingCleanupJob({
  db = pool,
  intervalMs = RESERVATION_PENDING_SCAN_INTERVAL_MS,
  commandSender = null,
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
        const cancellations = await dispatchPendingReservationCancellations(db, commandSender, { logError });
        return { pending: pendingResult, expired: expiredResult, cancellations };
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
  RESERVATION_NO_SHOW_FEE_DONG,
  RESERVATION_CALL_TIMEOUT_MS,
  failStalePendingReservations,
  expireStaleAcceptedReservations,
  dispatchReservationCancellation,
  dispatchPendingReservationCancellations,
  startReservationPendingCleanupJob,
};