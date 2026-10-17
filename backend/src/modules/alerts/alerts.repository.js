const { prepare } = require('../../db/pool');
const { scopeByOwner } = require('../../db/scope');

function list(actor, state) {
  const scope = scopeByOwner(actor, 's');
  const closed = state === 'closed' ? 'a.closed_at IS NOT NULL' : 'a.closed_at IS NULL';
  return prepare(
    `SELECT a.id, a.kind, a.severity, a.station_id, a.charge_point_id,
            a.connector_id, a.session_id, a.message, a.details, a.dedup_key,
            a.opened_at, a.closed_at, a.closed_by
     FROM alerts a JOIN stations s ON s.id = a.station_id
     WHERE ${scope.sql} AND ${closed}
     ORDER BY a.opened_at DESC, a.id DESC`
  ).all(...scope.params);
}

function findById(actor, id) {
  const scope = scopeByOwner(actor, 's');
  return prepare(
    `SELECT a.id, a.kind, a.severity, a.station_id, a.charge_point_id,
            a.connector_id, a.session_id, a.message, a.details, a.dedup_key,
            a.opened_at, a.closed_at, a.closed_by
     FROM alerts a JOIN stations s ON s.id = a.station_id
     WHERE a.id = ? AND ${scope.sql}`
  ).get(id, ...scope.params);
}

const existsById = async (id) => Boolean(await prepare('SELECT 1 FROM alerts WHERE id = ?').get(id));

module.exports = { list, findById, existsById };
