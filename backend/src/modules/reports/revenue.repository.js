const { scopeByOwner } = require('../../db/scope');

async function listRevenue(actor, { from, to, stationId }) {
  const scope = actor.roles.includes('ACCOUNTANT')
    ? { sql: 'TRUE', params: [] }
    : scopeByOwner(actor, 's');
  const values = [from, to];
  const conditions = ['si.period_date >= $1::date', 'si.period_date <= $2::date', "cs.billing_status = 'FINAL'"];

  if (scope.sql !== 'TRUE') {
    values.push(...scope.params);
    conditions.push(scope.sql.replace('?', `$${values.length}`));
  }
  if (stationId !== undefined) {
    values.push(stationId);
    conditions.push(`s.id = $${values.length}`);
  }

  const result = await require('../../db/pool').pool.query(
    `SELECT s.name AS station_name, cp.code AS charge_point_code, c.connector_no,
            COUNT(DISTINCT cs.id)::int AS sessions,
            COALESCE(SUM(CASE WHEN il.kind = 'ENERGY' THEN il.wh ELSE 0 END), 0)::text AS total_wh,
            COALESCE(SUM(CASE WHEN il.kind = 'ENERGY' THEN il.amount_dong ELSE 0 END), 0)::text AS energy_dong,
            COALESCE(SUM(CASE WHEN il.kind = 'IDLE' THEN il.amount_dong ELSE 0 END), 0)::text AS idle_dong,
            COALESCE(SUM(il.amount_dong), 0)::text AS total_dong
     FROM session_invoices si
     JOIN charging_sessions cs ON cs.id = si.session_id
     JOIN connectors c ON c.id = cs.connector_id
     JOIN charge_points cp ON cp.id = cs.charge_point_id
     JOIN stations s ON s.id = cp.station_id
     LEFT JOIN invoice_lines il ON il.invoice_id = si.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY s.name, cp.code, c.connector_no
     ORDER BY s.name, cp.code, c.connector_no`,
    values
  );
  return result.rows.map((row) => ({
    stationName: row.station_name,
    chargePointCode: row.charge_point_code,
    connectorNo: row.connector_no,
    sessions: row.sessions,
    totalWh: row.total_wh,
    energyDong: row.energy_dong,
    idleDong: row.idle_dong,
    totalDong: row.total_dong,
  }));
}

async function stationById(id) {
  const result = await require('../../db/pool').pool.query(
    'SELECT id, owner_id FROM stations WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

async function stationExists(id) {
  const result = await require('../../db/pool').pool.query('SELECT 1 FROM stations WHERE id = $1', [id]);
  return result.rowCount > 0;
}

module.exports = { listRevenue, stationById, stationExists };
