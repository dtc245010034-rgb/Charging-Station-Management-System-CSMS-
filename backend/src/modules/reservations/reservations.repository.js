const { pool } = require('../../db/pool');

async function findIdempotencyKey(client, driverId, key) {
  const result = await client.query(
    'SELECT request_hash, response_body FROM idempotency_keys WHERE user_id = $1 AND key = $2',
    [driverId, key]
  );
  return result.rows[0] || null;
}

async function findById(client, id) {
  const result = await client.query(
    `SELECT id, ocpp_reservation_id, driver_id, connector_id, id_tag_id, status,
            starts_at, expires_at, reject_reason
     FROM reservations WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function findConnector(client, connectorId, { forUpdate = false } = {}) {
  const result = await client.query(
    `SELECT c.id AS connector_id, c.connector_no, c.status AS connector_status, c.ocpp_status,
            cp.code AS charge_point_code, s.id AS station_id, s.status AS station_status,
            s.locked_at AS station_locked_at
     FROM connectors c
     JOIN charge_points cp ON cp.id = c.charge_point_id
     JOIN stations s ON s.id = cp.station_id
     WHERE c.id = $1
     ${forUpdate ? 'FOR UPDATE OF c, s' : ''}`,
    [connectorId]
  );
  return result.rows[0] || null;
}

async function findActiveTag(client, driverId, now) {
  const result = await client.query(
    `SELECT id, tag FROM id_tags
     WHERE user_id = $1 AND status = 'ACTIVE'
       AND (expires_at IS NULL OR expires_at > $2::timestamptz)
     ORDER BY is_virtual ASC, id
     LIMIT 1
     FOR SHARE`,
    [driverId, now]
  );
  return result.rows[0] || null;
}

async function insertPending(client, { driverId, connectorId, idTagId, startsAt, expiresAt }) {
  const result = await client.query(
    `INSERT INTO reservations (driver_id, connector_id, id_tag_id, starts_at, expires_at)
     VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)
     RETURNING id, ocpp_reservation_id, driver_id, connector_id, id_tag_id, status, starts_at, expires_at, reject_reason`,
    [driverId, connectorId, idTagId, startsAt, expiresAt]
  );
  return result.rows[0];
}

async function updateStatus(client, id, status, rejectReason = null) {
  await client.query(
    `UPDATE reservations
     SET status = $2, reject_reason = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id, status, rejectReason]
  );
  return findById(client, id);
}

async function insertIdempotencyKey(client, driverId, key, requestHash, reservationId) {
  await client.query(
    `INSERT INTO idempotency_keys (user_id, key, request_hash, response_body)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [driverId, key, requestHash, JSON.stringify({ reservationId: String(reservationId) })]
  );
}

async function findWalletForUpdate(client, driverId) {
  const result = await client.query(
    'SELECT balance_dong, locked, locked_at FROM wallets WHERE driver_id = $1 FOR UPDATE',
    [driverId]
  );
  return result.rows[0] || null;
}

async function findActiveForDriver(client, driverId) {
  const result = await client.query(
    `SELECT id FROM reservations
     WHERE driver_id = $1 AND status IN ('PENDING', 'ACCEPTED')
     LIMIT 1`,
    [driverId]
  );
  return result.rows[0] || null;
}

module.exports = {
  pool,
  findIdempotencyKey,
  findById,
  findConnector,
  findActiveTag,
  insertPending,
  updateStatus,
  insertIdempotencyKey,
  findWalletForUpdate,
  findActiveForDriver,
};