const { prepare } = require('../../db/pool');
const { scopeByOwner } = require('../../db/scope');

const list = (actor) => {
  const scope = scopeByOwner(actor, 's');
  return prepare(`SELECT s.*, COUNT(cp.id)::int AS charge_point_count FROM stations s LEFT JOIN charge_points cp ON cp.station_id = s.id WHERE ${scope.sql} GROUP BY s.id ORDER BY s.id DESC`).all(...scope.params);
};
const findById = (actor, id) => {
  const scope = scopeByOwner(actor, 's');
  return prepare(`SELECT s.* FROM stations s WHERE s.id = ? AND ${scope.sql}`).get(id, ...scope.params);
};
// Không lọc sở hữu: chỉ để phân biệt "của người khác" (403) với "không tồn tại" (404).
const existsById = async (id) => Boolean(await prepare('SELECT 1 FROM stations WHERE id = ?').get(id));
const chargePointsOf = (stationId) => prepare('SELECT * FROM charge_points WHERE station_id = ? ORDER BY id').all(stationId);
const insert = (actor, s) => prepare('INSERT INTO stations (name, address, latitude, longitude, status, owner_id) VALUES (?, ?, ?, ?, ?, ?)')
  .run(s.name, s.address, s.latitude ?? null, s.longitude ?? null, s.status, actor.id);

const UPDATABLE = ['name', 'address', 'latitude', 'longitude', 'status'];
const update = (id, fields) => {
  const keys = UPDATABLE.filter((key) => fields[key] !== undefined);
  return prepare(`UPDATE stations SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...keys.map((key) => fields[key]), id);
};

module.exports = { list, findById, existsById, chargePointsOf, insert, update, UPDATABLE };
