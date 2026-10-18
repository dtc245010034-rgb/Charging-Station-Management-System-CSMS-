const { pool } = require('../../db/pool');
const { postEntry } = require('../wallet/ledger.service');
const audit = require('../audit/audit.repository');
const { sendCancelReservation } = require('./cancel-retry-job');
const { sanitizeErrorMessage } = require('../../lib/constants');

async function expireReservationsOnce({ db = pool, commandSender, now = new Date() } = {}) {
  const currentTime = now instanceof Date ? now : new Date(now);
  const isoTime = currentTime.toISOString();

  const candidates = await db.query(
    `SELECT id FROM reservations
     WHERE status = 'ACCEPTED'
       AND expires_at <= $1::timestamptz
     ORDER BY id ASC`,
    [isoTime]
  );

  let fulfilledCount = 0;
  let expiredCount = 0;
  const processed = [];

  for (const { id } of candidates.rows) {
    const client = await db.connect();
    let handled = false;
    let reservationToCancel = null;
    try {
      await client.query('BEGIN');

      const res = await client.query(
        `SELECT r.id, r.ocpp_reservation_id, r.driver_id, r.connector_id,
                r.created_at, r.expires_at, r.no_show_fee_dong, r.status,
                cp.code AS charge_point_code
         FROM reservations r
         JOIN connectors c ON c.id = r.connector_id
         JOIN charge_points cp ON cp.id = c.charge_point_id
         WHERE r.id = $1
         FOR UPDATE OF r`,
        [id]
      );

      if (res.rowCount === 0 || res.rows[0].status !== 'ACCEPTED') {
        await client.query('ROLLBACK');
        continue;
      }

      const r = res.rows[0];

      // (a) Nếu tồn tại phiên sạc của ĐÚNG tài xế ở ĐÚNG đầu nối bắt đầu trong [created_at, expires_at]
      const sessionCheck = await client.query(
        `SELECT 1 FROM charging_sessions
         WHERE driver_id = $1
           AND connector_id = $2
           AND started_at >= $3
           AND started_at <= $4
         LIMIT 1`,
        [r.driver_id, r.connector_id, r.created_at, r.expires_at]
      );

      if (sessionCheck.rowCount > 0) {
        await client.query(
          `UPDATE reservations
           SET status = 'FULFILLED', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [r.id]
        );
        await client.query('COMMIT');
        fulfilledCount += 1;
        handled = true;
        continue;
      }

      // (b) Ngược lại: đánh EXPIRED, trừ phí một lần nếu no_show_fee_dong > 0
      const updateRes = await client.query(
        `UPDATE reservations
         SET status = 'EXPIRED',
             expired_at = $2::timestamptz,
             cancel_status = 'PENDING',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'ACCEPTED'
         RETURNING id`,
        [r.id, isoTime]
      );

      if (updateRes.rowCount === 0) {
        await client.query('ROLLBACK');
        continue;
      }

      const fee = BigInt(r.no_show_fee_dong || 0);
      if (fee > 0n) {
        await postEntry(client, {
          driverId: r.driver_id,
          entryType: 'RESERVATION_FEE',
          amountDong: -fee,
          reservationId: r.id,
          allowLocked: true,
        });
      }

      await audit.record(
        null,
        'RESERVATION_EXPIRED',
        'reservation',
        r.id,
        {
          noShowFeeDong: Number(fee),
          driverId: r.driver_id,
          connectorId: r.connector_id,
        },
        null,
        client,
        'COMPLETED'
      );

      await client.query('COMMIT');
      expiredCount += 1;
      handled = true;
      reservationToCancel = r;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Reservation expiry] Lỗi xử lý đặt chỗ ${id}:`, sanitizeErrorMessage(err?.message || err));
    } finally {
      client.release();
    }

    // SAU commit: gửi CancelReservation
    if (handled && reservationToCancel) {
      processed.push(reservationToCancel);
      if (commandSender) {
        void sendCancelReservation({
          db,
          commandSender,
          reservationId: reservationToCancel.id,
          chargePointCode: reservationToCancel.charge_point_code,
          ocppReservationId: reservationToCancel.ocpp_reservation_id,
        });
      }
    }
  }

  return { candidates: candidates.rowCount, fulfilled: fulfilledCount, expired: expiredCount, processed };
}

function startReservationExpiryJob({
  db = pool,
  commandSender,
  intervalMs = 15000,
  logError = console.error,
} = {}) {
  let running = null;
  async function run() {
    if (running) return running;
    running = (async () => {
      try {
        return await expireReservationsOnce({ db, commandSender });
      } catch (error) {
        logError(`[Reservation expiry] Lỗi chạy job quá hạn: ${sanitizeErrorMessage(error?.message || error)}`);
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
  expireReservationsOnce,
  startReservationExpiryJob,
};
