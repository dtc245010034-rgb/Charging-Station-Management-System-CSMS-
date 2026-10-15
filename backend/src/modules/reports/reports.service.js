const { pool } = require('../../db/pool');
const { scopeByOwner } = require('../../db/scope');
const { denyOrNotFound } = require('../../lib/ownership');
const { existsById } = require('../stations/stations.repository');

async function getRevenueReport(actor, { from, to, stationId }) {
  if (stationId) {
    // Nếu actor là STATION_OWNER, kiểm tra xem stationId có phải của mình không
    const roles = actor.roles || [];
    if (roles.includes('STATION_OWNER')) {
      const scope = scopeByOwner(actor, 's');
      const check = await pool.query(
        `SELECT s.id FROM stations s WHERE s.id = $1 AND ${scope.sql.replace('s.owner_id = ?', 's.owner_id = $2')}`,
        [stationId, ...scope.params]
      );
      if (check.rowCount === 0) {
        await denyOrNotFound(actor, 'stations', stationId, existsById, 'Không tìm thấy trạm');
      }
    } else {
      const exists = await existsById(stationId);
      if (!exists) {
        const { NotFoundError } = require('../../lib/errors');
        throw new NotFoundError('Không tìm thấy trạm');
      }
    }
  }

  const scope = scopeByOwner(actor, 's');
  let sqlScope = scope.sql;
  const params = [from, to];

  // Thay thế ? bằng $n cho scopeByOwner params
  for (const p of scope.params) {
    params.push(p);
    sqlScope = sqlScope.replace('?', `$${params.length}`);
  }

  let stationFilter = '';
  if (stationId) {
    params.push(stationId);
    stationFilter = ` AND s.id = $${params.length}`;
  }

  const query = `
    SELECT
      s.name AS "stationName",
      cp.code AS "chargePointCode",
      c.connector_no AS "connectorNo",
      COUNT(DISTINCT si.id)::int AS "sessions",
      COALESCE(SUM(il.wh) FILTER (WHERE il.kind = 'ENERGY'), 0)::bigint AS "totalWh",
      COALESCE(SUM(il.amount_dong) FILTER (WHERE il.kind = 'ENERGY'), 0)::bigint AS "energyDong",
      COALESCE(SUM(il.amount_dong) FILTER (WHERE il.kind = 'IDLE'), 0)::bigint AS "idleDong",
      COALESCE(SUM(il.amount_dong), 0)::bigint AS "totalDong"
    FROM connectors c
    JOIN charge_points cp ON cp.id = c.charge_point_id
    JOIN stations s ON s.id = cp.station_id
    LEFT JOIN charging_sessions cs ON cs.connector_id = c.id
      AND cs.billing_status = 'FINAL'
    LEFT JOIN session_invoices si ON si.session_id = cs.id
      AND si.period_date >= $1 AND si.period_date <= $2
    LEFT JOIN invoice_lines il ON il.invoice_id = si.id
    WHERE ${sqlScope} ${stationFilter}
    GROUP BY s.name, cp.code, c.connector_no, s.id, cp.id, c.id
    ORDER BY s.name, cp.code, c.connector_no
  `;

  const result = await pool.query(query, params);

  let totalSessions = 0;
  let totalWh = 0n;
  let energyDong = 0n;
  let idleDong = 0n;
  let totalDong = 0n;

  const rows = result.rows.map((row) => {
    const s = Number(row.sessions);
    const wh = BigInt(row.totalWh);
    const ed = BigInt(row.energyDong);
    const id = BigInt(row.idleDong);
    const td = BigInt(row.totalDong);

    totalSessions += s;
    totalWh += wh;
    energyDong += ed;
    idleDong += id;
    totalDong += td;

    return {
      stationName: row.stationName,
      chargePointCode: row.chargePointCode,
      connectorNo: row.connectorNo,
      sessions: s,
      totalWh: Number(wh),
      energyDong: Number(ed),
      idleDong: Number(id),
      totalDong: Number(td),
    };
  });

  return {
    rows,
    summary: {
      sessions: totalSessions,
      totalWh: Number(totalWh),
      energyDong: Number(energyDong),
      idleDong: Number(idleDong),
      totalDong: Number(totalDong),
    },
  };
}

module.exports = {
  getRevenueReport,
};
