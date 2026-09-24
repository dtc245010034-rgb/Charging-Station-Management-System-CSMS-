const { prepare } = require('../../db/pool');

const list = () => prepare('SELECT s.*, COUNT(cp.id)::int AS charge_point_count FROM stations s LEFT JOIN charge_points cp ON cp.station_id = s.id GROUP BY s.id ORDER BY s.id DESC').all();
const findById = (id) => prepare('SELECT * FROM stations WHERE id = ?').get(id);
const chargePointsOf = (stationId) => prepare('SELECT * FROM charge_points WHERE station_id = ? ORDER BY id').all(stationId);
const insert = (s) => prepare('INSERT INTO stations (name, address, latitude, longitude, status) VALUES (?, ?, ?, ?, ?)')
  .run(s.name, s.address, s.latitude ?? null, s.longitude ?? null, s.status);

const UPDATABLE = ['name', 'address', 'latitude', 'longitude', 'status'];
const update = (id, fields) => {
  const keys = UPDATABLE.filter((key) => fields[key] !== undefined);
  return prepare(`UPDATE stations SET ${keys.map((key) => `${key} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(...keys.map((key) => fields[key]), id);
};

module.exports = { list, findById, chargePointsOf, insert, update, UPDATABLE };
