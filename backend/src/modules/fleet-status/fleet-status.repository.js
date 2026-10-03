const { prepare } = require('../../db/pool');
const { scopeByOwner } = require('../../db/scope');

const snapshot = (actor) => {
  const scope = scopeByOwner(actor, 's');
  return prepare(`
    SELECT
      s.id AS station_id,
      s.name AS station_name,
      s.address AS station_address,
      s.status AS station_status,
      cp.id AS charge_point_id,
      cp.code AS charge_point_code,
      cp.status AS charge_point_status,
      cp.last_seen_at,
      cp.heartbeat_interval,
      (
        cp.status = 'OFFLINE'
        OR
        cp.last_seen_at IS NULL
        OR cp.last_seen_at <= CURRENT_TIMESTAMP - (cp.heartbeat_interval * INTERVAL '2 seconds')
      ) AS offline,
      c.id AS connector_id,
      c.connector_no,
      c.status AS connector_status,
      c.ocpp_status
    FROM stations s
    LEFT JOIN charge_points cp ON cp.station_id = s.id
    LEFT JOIN connectors c ON c.charge_point_id = cp.id
    WHERE ${scope.sql}
    ORDER BY s.id, cp.id, c.connector_no
  `).all(...scope.params);
};

module.exports = { snapshot };
