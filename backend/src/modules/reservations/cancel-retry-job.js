const { pool } = require('../../db/pool');
const { sanitizeErrorMessage } = require('../../lib/constants');

async function recordCancelFailedAlert(db, reservationId, connectorId) {
  try {
    const info = await db.query(
      `SELECT r.id, r.connector_id, c.charge_point_id, cp.station_id
       FROM reservations r
       JOIN connectors c ON c.id = r.connector_id
       JOIN charge_points cp ON cp.id = c.charge_point_id
       WHERE r.id = $1`,
      [reservationId]
    );
    if (info.rows.length === 0) return;
    const { station_id, charge_point_id } = info.rows[0];
    await db.query(
      `INSERT INTO alerts (kind, severity, station_id, charge_point_id, connector_id, message, details, dedup_key)
       VALUES ('RESERVATION_CANCEL_FAILED', 'WARNING', $1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (kind, dedup_key) WHERE closed_at IS NULL DO NOTHING`,
      [
        station_id,
        charge_point_id,
        connectorId || info.rows[0].connector_id,
        `Không thể gửi lệnh CancelReservation tới trụ sau 5 lần thử cho đặt chỗ ${reservationId}`,
        JSON.stringify({ reservationId }),
        `res:${reservationId}`,
      ]
    );
  } catch (alertErr) {
    console.error('[Alert] Lỗi tạo alert RESERVATION_CANCEL_FAILED:', sanitizeErrorMessage(alertErr?.message || alertErr));
  }
}

async function sendCancelReservation({ db = pool, commandSender, reservationId, chargePointCode, ocppReservationId }) {
  if (!commandSender || !ocppReservationId || !chargePointCode) return false;
  try {
    await commandSender.send(
      chargePointCode,
      'CancelReservation',
      { reservationId: Number(ocppReservationId) },
      { timeoutMs: 10000 }
    );
    await db.query(
      `UPDATE reservations
       SET cancel_status = 'SENT', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND cancel_status = 'PENDING'`,
      [reservationId]
    );
    return true;
  } catch {
    const result = await db.query(
      `UPDATE reservations
       SET cancel_attempts = cancel_attempts + 1,
           cancel_status = CASE WHEN cancel_attempts + 1 >= 5 THEN 'FAILED' ELSE 'PENDING' END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND cancel_status = 'PENDING'
       RETURNING cancel_status, cancel_attempts, connector_id`,
      [reservationId]
    );
    if (result.rows[0]?.cancel_status === 'FAILED') {
      await recordCancelFailedAlert(db, reservationId, result.rows[0].connector_id);
    }
    return false;
  }
}

async function retryCancelPendingReservationsOnce({ db = pool, commandSender } = {}) {
  if (!commandSender) return { retried: 0, sent: 0, failed: 0 };
  const candidates = await db.query(
    `SELECT r.id, r.ocpp_reservation_id, r.cancel_attempts, cp.code AS charge_point_code, c.id AS connector_id
     FROM reservations r
     JOIN connectors c ON c.id = r.connector_id
     JOIN charge_points cp ON cp.id = c.charge_point_id
     WHERE r.cancel_status = 'PENDING'
       AND r.cancel_attempts < 5
     ORDER BY r.id ASC`
  );

  let sent = 0;
  let failed = 0;
  for (const row of candidates.rows) {
    const ok = await sendCancelReservation({
      db,
      commandSender,
      reservationId: row.id,
      chargePointCode: row.charge_point_code,
      ocppReservationId: row.ocpp_reservation_id,
    });
    if (ok) sent += 1;
    else failed += 1;
  }
  return { retried: candidates.rowCount, sent, failed };
}

function startReservationCancelRetryJob({
  db = pool,
  commandSender,
  intervalMs = 30000,
  logError = console.error,
} = {}) {
  let running = null;
  async function run() {
    if (running) return running;
    running = (async () => {
      try {
        return await retryCancelPendingReservationsOnce({ db, commandSender });
      } catch (error) {
        logError(`[Reservation cancel retry] Lỗi thử lại hủy chỗ: ${sanitizeErrorMessage(error?.message || error)}`);
        return null;
      }
    })().finally(() => { running = null; });
    return running;
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  recordCancelFailedAlert,
  sendCancelReservation,
  retryCancelPendingReservationsOnce,
  startReservationCancelRetryJob,
};
