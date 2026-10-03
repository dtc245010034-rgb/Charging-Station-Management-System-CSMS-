const repo = require('./fleet-status.repository');

async function snapshot(actor) {
  const rows = await repo.snapshot(actor);
  const stations = [];
  const stationsById = new Map();
  const chargePointsById = new Map();

  for (const row of rows) {
    let station = stationsById.get(row.station_id);
    if (!station) {
      station = {
        id: row.station_id,
        name: row.station_name,
        address: row.station_address,
        status: row.station_status,
        charge_points: [],
      };
      stationsById.set(row.station_id, station);
      stations.push(station);
    }

    if (row.charge_point_id === null) continue;

    let chargePoint = chargePointsById.get(row.charge_point_id);
    if (!chargePoint) {
      chargePoint = {
        id: row.charge_point_id,
        code: row.charge_point_code,
        status: row.charge_point_status,
        last_seen_at: row.last_seen_at,
        heartbeat_interval: row.heartbeat_interval,
        offline: row.offline,
        connectors: [],
      };
      chargePointsById.set(row.charge_point_id, chargePoint);
      station.charge_points.push(chargePoint);
    }

    if (row.connector_id !== null) {
      chargePoint.connectors.push({
        id: row.connector_id,
        connector_no: row.connector_no,
        status: row.connector_status,
        ocpp_status: row.ocpp_status,
      });
    }
  }

  return { stations };
}

module.exports = { snapshot };
