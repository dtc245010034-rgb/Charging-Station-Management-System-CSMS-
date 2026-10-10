const { query } = require('./db');

async function seedStation(ownerId, { code = 'CP-S22-01', idTag = null, idTagUserId = null } = {}) {
  const station = await query(
    "INSERT INTO stations (name, address, owner_id, status) VALUES ('Trạm S22', 'x', $1, 'ACTIVE') RETURNING id",
    [ownerId]
  );
  const chargePoint = await query(
    "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'ONLINE') RETURNING id",
    [station.rows[0].id, code]
  );
  const connector = await query(
    "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'OCCUPIED', 'Charging') RETURNING id",
    [chargePoint.rows[0].id]
  );
  if (idTag) {
    await query("INSERT INTO id_tags (tag, user_id, status) VALUES ($1, $2, 'ACTIVE')", [idTag, idTagUserId]);
  }
  return {
    stationId: station.rows[0].id,
    chargePointId: chargePoint.rows[0].id,
    connectorId: connector.rows[0].id,
    code,
  };
}

// readings: mảng [measurand, value, unit]
async function seedSession({
  chargePointId, connectorId, driverId, status = 'CHARGING', meterStart = 10000, meterStop = null,
  startedAt = '2026-10-10T00:00:00Z', stoppedAt = null, readings = [],
}) {
  const session = await query(
    `INSERT INTO charging_sessions (charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
       meter_start, meter_stop, started_at, stopped_at, status)
     VALUES ($1, $2, 1, $3, 'A1B2', $4, $5, $6, $7, $8) RETURNING id`,
    [chargePointId, connectorId, driverId, meterStart, meterStop, startedAt, stoppedAt, status]
  );
  const id = session.rows[0].id;
  for (const [measurand, value, unit] of readings) {
    await query(
      `INSERT INTO meter_values (session_id, reported_at, sampled_at, measurand, value, unit, raw_unit)
       VALUES ($1, '2026-10-10T00:05:00Z', '2026-10-10T00:05:00Z', $2, $3, $4, $4)`,
      [id, measurand, value, unit]
    );
  }
  return id;
}

async function waitFor(predicate, { timeoutMs = 2000, stepMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  return predicate();
}

module.exports = { seedStation, seedSession, waitFor };
