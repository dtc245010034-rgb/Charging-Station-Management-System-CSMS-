const { pool } = require('../../db/pool');

async function listCompletedSessions({ from, to }) {
  const result = await pool.query(
    `SELECT cs.id, cs.status, cs.billing_status, cs.billing_reason, cs.meter_start, cs.meter_stop,
            cs.started_at, cs.stopped_at, cs.driver_id, s.name AS station_name,
            cp.code AS charge_point_code, cs.connector_no,
            si.id AS invoice_id, si.driver_id AS invoice_driver_id, si.tariff_snapshot,
            si.timezone, si.total_dong AS invoice_total_dong,
            COALESCE(lines.billed_wh, 0)::text AS billed_wh,
            COALESCE(lines.items, '[]'::jsonb) AS invoice_lines,
            COALESCE(ledger.entry_count, 0)::int AS ledger_count,
            COALESCE(ledger.amount_dong, 0)::text AS ledger_amount_dong
     FROM charging_sessions cs
     JOIN charge_points cp ON cp.id = cs.charge_point_id
     JOIN stations s ON s.id = cp.station_id
     LEFT JOIN session_invoices si ON si.session_id = cs.id
     LEFT JOIN LATERAL (
       SELECT SUM(il.wh) FILTER (WHERE il.kind = 'ENERGY') AS billed_wh,
              jsonb_agg(jsonb_build_object(
                'kind', il.kind, 'wh', il.wh, 'amountDong', il.amount_dong,
                'from', il.from_at, 'to', il.to_at, 'minutes', il.minutes,
                'perMinDong', il.per_min_dong
              ) ORDER BY il.seq) AS items
       FROM invoice_lines il
       WHERE il.invoice_id = si.id
     ) lines ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS entry_count, SUM(wl.amount_dong) AS amount_dong
       FROM wallet_ledger wl
       WHERE wl.session_id = cs.id AND wl.entry_type = 'SESSION_DEBIT'
     ) ledger ON TRUE
     WHERE cs.status = 'COMPLETED'
       AND (
         (si.id IS NOT NULL AND si.period_date BETWEEN $1::date AND $2::date)
         OR (si.id IS NULL AND (cs.stopped_at AT TIME ZONE s.timezone)::date BETWEEN $1::date AND $2::date)
       )
     ORDER BY cs.id
     LIMIT 5001`,
    [from, to]
  );
  return result.rows;
}

async function listEnergySamples(sessionIds) {
  if (!sessionIds.length) return [];
  const result = await pool.query(
    `SELECT mv.session_id, mv.sampled_at, mv.value, COALESCE(mv.raw_unit, mv.unit) AS unit
     FROM meter_values mv
     JOIN charging_sessions cs ON cs.id = mv.session_id
     WHERE mv.session_id = ANY($1::bigint[])
       AND mv.measurand = 'Energy.Active.Import.Register'
       AND (mv.phase IS NULL OR mv.phase = '')
       AND mv.reported_at = mv.sampled_at
       AND mv.sampled_at > cs.started_at
       AND mv.sampled_at < cs.stopped_at
     ORDER BY mv.session_id, mv.sampled_at, mv.id`,
    [sessionIds]
  );
  return result.rows;
}

module.exports = { listCompletedSessions, listEnergySamples };
