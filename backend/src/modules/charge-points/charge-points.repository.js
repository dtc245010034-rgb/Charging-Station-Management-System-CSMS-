const { prepare } = require('../../db/pool');

const list = () => prepare('SELECT cp.*, s.name AS station_name FROM charge_points cp JOIN stations s ON s.id = cp.station_id ORDER BY cp.id DESC').all();
const findDetailById = (id) => prepare('SELECT cp.*, s.name AS station_name FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.id = ?').get(id);
const findById = (id) => prepare('SELECT * FROM charge_points WHERE id = ?').get(id);
const connectorsOf = (chargePointId) => prepare('SELECT * FROM connectors WHERE charge_point_id = ? ORDER BY connector_no').all(chargePointId);
const stationExists = async (stationId) => Boolean(await prepare('SELECT 1 FROM stations WHERE id = ?').get(stationId));

const insert = async (client, stationId, cp) => {
  const r = await client.query(
    'INSERT INTO charge_points (station_id, code, model, vendor, status, power_kw) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [stationId, cp.code, cp.model || null, cp.vendor || null, cp.status, cp.power_kw]
  );
  return r.rows[0].id;
};
const insertConnector = (client, chargePointId, connectorNo) =>
  client.query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, $2)', [chargePointId, connectorNo]);

const UPDATABLE = ['code', 'model', 'vendor', 'status', 'power_kw'];
const update = (id, fields) => {
  const keys = UPDATABLE.filter((key) => fields[key] !== undefined);
  return prepare(`UPDATE charge_points SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...keys.map((key) => fields[key]), id);
};

module.exports = { list, findDetailById, findById, connectorsOf, stationExists, insert, insertConnector, update, UPDATABLE };
