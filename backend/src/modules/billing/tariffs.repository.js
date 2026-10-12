const { prepare } = require('../../db/pool');

const listByStation = async (stationId) => {
  return prepare(
    `SELECT t.id, t.station_id, t.version, TO_CHAR(t.effective_from, 'YYYY-MM-DD') AS effective_from,
            t.idle_grace_min, t.idle_per_min_dong, t.created_by, t.created_at,
            u.email AS created_by_email
     FROM tariffs t
     LEFT JOIN users u ON u.id = t.created_by
     WHERE t.station_id = ?
     ORDER BY t.effective_from DESC, t.version DESC`
  ).all(stationId);
};

const periodsOfTariff = async (tariffId) => {
  return prepare(
    `SELECT id, tariff_id, start_minute, end_minute, price_per_kwh_dong, label
     FROM tariff_periods
     WHERE tariff_id = ?
     ORDER BY start_minute ASC`
  ).all(tariffId);
};

const countTariffs = async (stationId) => {
  const row = await prepare('SELECT COUNT(*)::int AS count FROM tariffs WHERE station_id = ?').get(stationId);
  return row ? row.count : 0;
};

const maxVersion = async (stationId) => {
  const row = await prepare('SELECT MAX(version)::int AS max_ver FROM tariffs WHERE station_id = ?').get(stationId);
  return row && row.max_ver != null ? row.max_ver : 0;
};

const existsForDate = async (stationId, effectiveFrom) => {
  const row = await prepare('SELECT 1 FROM tariffs WHERE station_id = ? AND effective_from = ?::date').get(stationId, effectiveFrom);
  return Boolean(row);
};

const insertTariffWithPeriods = async (client, tariffData, periods) => {
  const tariffRes = await client.query(
    `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong, created_by)
     VALUES ($1, $2, $3::date, $4, $5, $6)
     RETURNING id, station_id, version, TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from,
               idle_grace_min, idle_per_min_dong, created_by, created_at`,
    [
      tariffData.stationId,
      tariffData.version,
      tariffData.effectiveFrom,
      tariffData.idleGraceMin,
      tariffData.idlePerMinDong,
      tariffData.createdBy || null,
    ]
  );
  const createdTariff = tariffRes.rows[0];

  const insertedPeriods = [];
  for (const period of periods) {
    const periodRes = await client.query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tariff_id, start_minute, end_minute, price_per_kwh_dong, label`,
      [
        createdTariff.id,
        period.startMin,
        period.endMin,
        period.pricePerKwh,
        period.label || null,
      ]
    );
    insertedPeriods.push(periodRes.rows[0]);
  }

  return {
    ...createdTariff,
    periods: insertedPeriods,
  };
};

module.exports = {
  listByStation,
  periodsOfTariff,
  countTariffs,
  maxVersion,
  existsForDate,
  insertTariffWithPeriods,
};
