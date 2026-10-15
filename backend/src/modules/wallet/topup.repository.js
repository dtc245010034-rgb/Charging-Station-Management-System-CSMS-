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

module.exports = {
  createTopup,
  findByDriverAndIdempotencyKey,
  countPendingByDriver,
  findByRef,
};
