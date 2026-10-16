const { stationBody, postStation } = require('./station');

async function createPowerFixture({ owner, query, name, powerLimitKw, sessions }) {
  const station = (await postStation(owner, stationBody({
    name,
    power_limit_kw: powerLimitKw,
  }))).body;
  const records = [];

  for (const [index, item] of sessions.entries()) {
    const point = await query(
      'INSERT INTO charge_points (station_id, code, power_kw) VALUES ($1, $2, $3) RETURNING id',
      [station.id, item.code, item.ratedW / 1000]
    );
    const connector = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, rated_power_w, status, ocpp_status)
       VALUES ($1, 1, $2, 'OCCUPIED', $3) RETURNING id`,
      [point.rows[0].id, item.ratedW, item.ocppStatus || 'Charging']
    );
    const session = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, meter_start, started_at, status
       ) VALUES ($1, $2, 1, $3, 1000, CURRENT_TIMESTAMP, $4) RETURNING id`,
      [point.rows[0].id, connector.rows[0].id, `MASKED-POWER-${index + 1}`, item.status || 'CHARGING']
    );
    records.push({
      sessionId: session.rows[0].id,
      chargePointId: point.rows[0].id,
      connectorId: connector.rows[0].id,
      code: item.code,
      ratedW: item.ratedW,
    });
  }

  return { stationId: station.id, sessions: records };
}

module.exports = { createPowerFixture };
