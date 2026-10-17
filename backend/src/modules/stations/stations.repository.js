const { prepare } = require('../../db/pool');
const { scopeByOwner } = require('../../db/scope');

const ratedTotalW = `(SELECT COALESCE(SUM(COALESCE(c.rated_power_w, ROUND(cp.power_kw * 1000)::integer)), 0)::bigint
  FROM charge_points cp JOIN connectors c ON c.charge_point_id = cp.id
  WHERE cp.station_id = s.id)`;

const list = (actor) => {
  const scope = scopeByOwner(actor, 's');
  return prepare(`SELECT s.*,
    (SELECT COUNT(*)::int FROM charge_points cp WHERE cp.station_id = s.id) AS charge_point_count,
    ${ratedTotalW} AS rated_total_w
    FROM stations s WHERE ${scope.sql} ORDER BY s.id DESC`).all(...scope.params);
};
const searchCandidates = ({ queryPattern = null, connectorType = null } = {}) => prepare(
  `SELECT s.id, s.name, s.address, s.latitude, s.longitude
   FROM stations s
   WHERE s.status = 'ACTIVE' AND s.locked_at IS NULL
    AND (?::text IS NULL OR s.name ILIKE ? ESCAPE E'\\\\' OR s.address ILIKE ? ESCAPE E'\\\\')
     AND (?::text IS NULL OR EXISTS (
       SELECT 1 FROM connectors c
       JOIN charge_points cp ON cp.id = c.charge_point_id
       WHERE cp.station_id = s.id AND UPPER(c.type) = UPPER(?)
     ))`
).all(queryPattern, queryPattern, queryPattern, connectorType, connectorType);
const searchConnectors = async (stationIds) => {
  if (!stationIds.length) return [];
  const placeholders = stationIds.map(() => '?').join(', ');
  return prepare(
    `SELECT cp.station_id, cp.code AS charge_point_code, c.type, c.ocpp_status
     FROM connectors c
     JOIN charge_points cp ON cp.id = c.charge_point_id
     WHERE cp.station_id IN (${placeholders})`
  ).all(...stationIds);
};
const findById = (actor, id) => {
  const scope = scopeByOwner(actor, 's');
  return prepare(`SELECT s.*, ${ratedTotalW} AS rated_total_w FROM stations s WHERE s.id = ? AND ${scope.sql}`).get(id, ...scope.params);
};
// Không lọc sở hữu: chỉ để phân biệt "của người khác" (403) với "không tồn tại" (404).
const existsById = async (id) => Boolean(await prepare('SELECT 1 FROM stations WHERE id = ?').get(id));
const chargePointsOf = (stationId) => prepare('SELECT * FROM charge_points WHERE station_id = ? ORDER BY id').all(stationId);
const connectorsOf = (chargePointId) => prepare(
  `SELECT c.*, COALESCE(c.rated_power_w, ROUND(cp.power_kw * 1000)::integer) AS effective_power_w
   FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id
   WHERE c.charge_point_id = ? ORDER BY c.connector_no`
).all(chargePointId);
const insertForIdempotency = async (client, actor, station) => {
  const result = await client.query(
    'INSERT INTO stations (name, address, latitude, longitude, owner_id, timezone, power_limit_w) VALUES ($1, $2, $3, $4, $5, COALESCE($6, \'Asia/Ho_Chi_Minh\'), $7) RETURNING *',
    [station.name, station.address, station.latitude, station.longitude, actor.id, station.timezone || null, station.power_limit_w ?? null]
  );
  return result.rows[0];
};

const UPDATABLE = ['name', 'address', 'latitude', 'longitude', 'status', 'timezone', 'power_limit_w'];
const update = (id, fields) => {
  const keys = UPDATABLE.filter((key) => fields[key] !== undefined);
  return prepare(`UPDATE stations SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...keys.map((key) => fields[key]), id);
};

const setLock = (id, locked, actorId) => {
  if (locked) {
    return prepare('UPDATE stations SET locked_at = CURRENT_TIMESTAMP, locked_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(actorId, id);
  }
  return prepare('UPDATE stations SET locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(id);
};

const connectorById = (actor, id) => {
  const scope = scopeByOwner(actor, 's');
  return prepare(
    `SELECT c.*, s.owner_id, cp.station_id, cp.code AS charge_point_code,
            COALESCE(c.rated_power_w, ROUND(cp.power_kw * 1000)::integer) AS effective_power_w
     FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id
     JOIN stations s ON s.id = cp.station_id
     WHERE c.id = ? AND ${scope.sql}`
  ).get(id, ...scope.params);
};
const connectorExistsById = async (id) => Boolean(await prepare('SELECT 1 FROM connectors WHERE id = ?').get(id));
const updateConnectorPower = (id, watts) => prepare(
  'UPDATE connectors SET rated_power_w = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
).run(watts, id);

module.exports = {
  list, searchCandidates, searchConnectors, findById, existsById, chargePointsOf, connectorsOf, insertForIdempotency, update, setLock, UPDATABLE,
  connectorById, connectorExistsById, updateConnectorPower,
};
