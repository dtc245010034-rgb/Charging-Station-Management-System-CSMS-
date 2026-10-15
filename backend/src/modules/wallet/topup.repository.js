const { pool } = require('../../db/pool');

async function createTopup({
  driverId,
  amountDong,
  orderRef,
  idempotencyKey,
  expiresAt,
  gateway = 'SANDBOX',
}, db = pool) {
  const result = await db.query(
    `INSERT INTO wallet_topups (
       driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at
     ) VALUES ($1, $2, 'PENDING', $3, $4, $5, $6)
     ON CONFLICT (driver_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [driverId, amountDong.toString(), orderRef, gateway, idempotencyKey, expiresAt]
  );
  return result.rows[0] || null;
}

async function findByDriverAndIdempotencyKey(driverId, idempotencyKey, db = pool) {
  const result = await db.query(
    `SELECT * FROM wallet_topups
     WHERE driver_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [driverId, idempotencyKey]
  );
  return result.rows[0] || null;
}

async function countPendingByDriver(driverId, db = pool) {
  const result = await db.query(
    `SELECT count(*)::int AS count
     FROM wallet_topups
     WHERE driver_id = $1 AND status = 'PENDING' AND expires_at > CURRENT_TIMESTAMP`,
    [driverId]
  );
  return result.rows[0]?.count || 0;
}

async function findByRef(orderRef, db = pool) {
  const result = await db.query(
    `SELECT * FROM wallet_topups
     WHERE order_ref = $1
     LIMIT 1`,
    [orderRef]
  );
  return result.rows[0] || null;
}

// Cập nhật trạng thái đơn nạp từ webhook; trả về row sau khi UPDATE (hoặc null nếu không khớp).
async function updateTopupStatus({
  orderRef,
  newStatus,
  gatewayTxnId = null,
  failureReason = null,
  allowedCurrentStatuses = ['PENDING', 'EXPIRED'],
}, db = pool) {
  const placeholders = allowedCurrentStatuses.map((_, i) => `$${i + 3}`).join(', ');
  const result = await db.query(
    `UPDATE wallet_topups
     SET status = $1,
         gateway_txn_id = COALESCE($2, gateway_txn_id),
         failure_reason = CASE WHEN $1 = 'SUCCESS' THEN NULL ELSE COALESCE($${allowedCurrentStatuses.length + 3}, failure_reason) END,
         completed_at = CASE WHEN $1 IN ('SUCCESS','FAILED','CANCELLED') THEN CURRENT_TIMESTAMP ELSE completed_at END
     WHERE order_ref = $${allowedCurrentStatuses.length + 4}
       AND status IN (${placeholders})
     RETURNING *`,
    [newStatus, gatewayTxnId, ...allowedCurrentStatuses, failureReason, orderRef]
  );
  return result.rows[0] || null;
}

module.exports = {
  createTopup,
  findByDriverAndIdempotencyKey,
  countPendingByDriver,
  findByRef,
  updateTopupStatus,
};
