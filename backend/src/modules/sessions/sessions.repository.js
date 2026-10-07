const { maskIdTag } = require('../ocpp/handlers/authorize');

async function findConnectorWithStation(db, { chargePointId, connectorNo }) {
  const query = `
    SELECT
      c.id AS connector_id,
      c.connector_no,
      c.status AS connector_status,
      c.ocpp_status AS connector_ocpp_status,
      cp.id AS charge_point_id,
      cp.code AS charge_point_code,
      cp.station_id,
      s.status AS station_status,
      s.locked_at AS station_locked_at
    FROM connectors c
    JOIN charge_points cp ON cp.id = c.charge_point_id
    JOIN stations s ON s.id = cp.station_id
    WHERE cp.id = $1 AND c.connector_no = $2
    LIMIT 1
  `;
  const result = await db.query(query, [chargePointId, connectorNo]);
  return result.rows[0] || null;
}

async function findTagByTagValue(db, idTag) {
  const result = await db.query(
    'SELECT id, tag, status, expires_at, user_id FROM id_tags WHERE UPPER(tag) = UPPER($1) LIMIT 1',
    [idTag]
  );
  return result.rows[0] || null;
}

async function closeActiveSessionAsAbnormal(db, { connectorId, reason = 'Replaced by new transaction' }) {
  const query = `
    UPDATE charging_sessions
    SET status = 'ABNORMAL',
        needs_review = TRUE,
        review_reason = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE connector_id = $1 AND status = 'CHARGING'
    RETURNING id
  `;
  const result = await db.query(query, [connectorId, reason]);
  return result.rows;
}

async function startSession(db, {
  chargePointId,
  connectorId,
  connectorNo,
  idTagId = null,
  idTagMasked,
  driverId = null,
  meterStart,
  startedAt,
  status = 'CHARGING',
  needsReview = false,
  reviewReason = null,
}) {
  const query = `
    INSERT INTO charging_sessions (
      charge_point_id,
      connector_id,
      connector_no,
      id_tag_id,
      id_tag_masked,
      driver_id,
      meter_start,
      started_at,
      status,
      needs_review,
      review_reason
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (charge_point_id, connector_no, id_tag_masked, meter_start, started_at)
    DO UPDATE SET updated_at = charging_sessions.updated_at
    RETURNING id, status, needs_review, review_reason
  `;

  const values = [
    chargePointId,
    connectorId,
    connectorNo,
    idTagId,
    idTagMasked,
    driverId,
    meterStart,
    startedAt,
    status,
    needsReview,
    reviewReason,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

async function recordOrphanMessage(db, {
  chargePointId,
  action,
  payload,
  reason,
}) {
  const safePayload = { ...payload };
  if (safePayload.idTag) {
    safePayload.idTag = maskIdTag(safePayload.idTag);
  }

  const query = `
    INSERT INTO orphan_messages (charge_point_id, action, payload, reason)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `;
  const result = await db.query(query, [
    chargePointId,
    action,
    JSON.stringify(safePayload),
    reason,
  ]);
  return result.rows[0];
}

async function findNaturalSession(db, { chargePointId, connectorNo, idTagMasked, meterStart, startedAt }) {
  const query = `
    SELECT id, status, needs_review, review_reason
    FROM charging_sessions
    WHERE charge_point_id = $1
      AND connector_no = $2
      AND id_tag_masked = $3
      AND meter_start = $4
      AND started_at = $5
    LIMIT 1
  `;
  const result = await db.query(query, [
    chargePointId,
    connectorNo,
    idTagMasked,
    meterStart,
    startedAt,
  ]);
  return result.rows[0] || null;
}

async function lockConnectorRow(db, connectorId) {
  const result = await db.query('SELECT id FROM connectors WHERE id = $1 FOR UPDATE', [connectorId]);
  return result.rows[0] || null;
}

module.exports = {
  findConnectorWithStation,
  findTagByTagValue,
  closeActiveSessionAsAbnormal,
  startSession,
  recordOrphanMessage,
  findNaturalSession,
  lockConnectorRow,
};
