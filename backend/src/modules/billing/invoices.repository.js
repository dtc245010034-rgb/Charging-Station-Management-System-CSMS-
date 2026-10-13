function getDefaultPool() {
  return require('../../db/pool').pool;
}

async function findBySessionId(dbOrPool, sessionId) {
  const client = dbOrPool || getDefaultPool();
  const result = await client.query(
    `SELECT cs.id AS session_id, cs.billing_status, cs.billing_reason,
            si.id, si.driver_id, si.station_id, si.tariff_id, si.tariff_snapshot,
            si.timezone, si.rounding_rule, si.total_dong, si.period_date, si.issued_at
     FROM charging_sessions cs
     LEFT JOIN session_invoices si ON si.session_id = cs.id
     WHERE cs.id = $1`,
    [sessionId]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.id === null) {
    return {
      sessionId: row.session_id,
      billingStatus: row.billing_status,
      billingReason: row.billing_reason,
      invoice: null,
    };
  }

  const lines = await client.query(
    `SELECT seq, kind, local_date, from_at, to_at, wh, price_per_kwh,
            minutes, per_min_dong, amount_dong
     FROM invoice_lines
     WHERE invoice_id = $1
     ORDER BY seq`,
    [row.id]
  );
  return {
    sessionId: row.session_id,
    billingStatus: row.billing_status,
    billingReason: row.billing_reason,
    invoice: {
      id: row.id,
      driverId: row.driver_id,
      stationId: row.station_id,
      tariffId: row.tariff_id,
      tariffSnapshot: row.tariff_snapshot,
      timezone: row.timezone,
      roundingRule: row.rounding_rule,
      totalDong: row.total_dong,
      periodDate: row.period_date,
      issuedAt: row.issued_at,
      lines: lines.rows.map((line) => ({
        seq: line.seq,
        kind: line.kind,
        localDate: line.local_date,
        from: line.from_at,
        to: line.to_at,
        wh: line.wh,
        pricePerKwh: line.price_per_kwh,
        minutes: line.minutes,
        perMinDong: line.per_min_dong,
        amountDong: line.amount_dong,
      })),
    },
  };
}

module.exports = { findBySessionId };
