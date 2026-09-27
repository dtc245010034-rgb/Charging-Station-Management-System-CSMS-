const { prepare } = require('../../db/pool');
const { scopeByOwner } = require('../../db/scope');

const normalizeCode = (code) => String(code ?? '').trim().toUpperCase();

const list = (actor) => {
  const scope = scopeByOwner(actor, 's');
  return prepare(`SELECT cp.*, s.name AS station_name FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE ${scope.sql} ORDER BY cp.id DESC`).all(...scope.params);
};
const findDetailById = (actor, id) => {
  const scope = scopeByOwner(actor, 's');
  return prepare(`SELECT cp.*, s.name AS station_name FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.id = ? AND ${scope.sql}`).get(id, ...scope.params);
};
const findById = (actor, id) => {
  const scope = scopeByOwner(actor, 's');
  return prepare(`SELECT cp.* FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.id = ? AND ${scope.sql}`).get(id, ...scope.params);
};
const connectorsOf = (chargePointId) => prepare('SELECT * FROM connectors WHERE charge_point_id = ? ORDER BY connector_no').all(chargePointId);
const stationInScope = async (actor, stationId) => {
  const scope = scopeByOwner(actor, 's');
  return Boolean(await prepare(`SELECT 1 FROM stations s WHERE s.id = ? AND ${scope.sql}`).get(stationId, ...scope.params));
};
const codeAvailable = async (code) => {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  return !await prepare('SELECT 1 FROM charge_points WHERE UPPER(TRIM(code)) = ?').get(normalized);
};
// Không lọc sở hữu: chỉ để phân biệt "của người khác" (403) với "không tồn tại" (404).
const existsById = async (id) => Boolean(await prepare('SELECT 1 FROM charge_points WHERE id = ?').get(id));
const stationExists = async (stationId) => Boolean(await prepare('SELECT 1 FROM stations WHERE id = ?').get(stationId));

const insert = async (client, stationId, cp) => {
  const normalizedCode = normalizeCode(cp.code);
  const r = await client.query(
    'INSERT INTO charge_points (station_id, code, model, vendor, status, power_kw) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [stationId, normalizedCode, cp.model || null, cp.vendor || null, cp.status, cp.power_kw]
  );
  return r.rows[0].id;
};
const insertConnector = (client, chargePointId, connectorNo) =>
  client.query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, $2)', [chargePointId, connectorNo]);

const UPDATABLE = ['code', 'model', 'vendor', 'status', 'power_kw'];
const update = (id, fields) => {
  const normalizedFields = { ...fields };
  if (normalizedFields.code !== undefined) normalizedFields.code = normalizeCode(normalizedFields.code);
  const keys = UPDATABLE.filter((key) => normalizedFields[key] !== undefined);
  return prepare(`UPDATE charge_points SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...keys.map((key) => normalizedFields[key]), id);
};

module.exports = { list, findDetailById, findById, connectorsOf, stationInScope, codeAvailable, existsById, stationExists, insert, insertConnector, update, UPDATABLE };
