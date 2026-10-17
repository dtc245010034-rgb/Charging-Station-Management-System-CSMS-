const { pool } = require('../../db/pool');

async function findPeriodForUpdate(client, month) {
  const result = await client.query(
    `SELECT status, closed_at::text AS closed_at
     FROM accounting_periods
     WHERE month = $1::date
     FOR UPDATE`,
    [`${month}-01`]
  );
  return result.rows[0] ?? null;
}

async function latestStatement(client, month, closedAt) {
  const result = await client.query(
    `SELECT id::text, version,
            $2::timestamptz > period_closed_at AS newer_close
     FROM settlement_statements
     WHERE month = $1::date
     ORDER BY version DESC
     LIMIT 1`,
    [`${month}-01`, closedAt]
  );
  return result.rows[0] ?? null;
}

async function listInvoices(client, month) {
  const result = await client.query(
    `SELECT s.owner_id::text AS owner_id,
            si.period_date::text AS period_date,
            COALESCE(SUM(il.amount_dong) FILTER (WHERE il.kind = 'ENERGY'), 0)::text AS energy_dong,
            COALESCE(SUM(il.amount_dong) FILTER (WHERE il.kind = 'IDLE'), 0)::text AS idle_dong
     FROM session_invoices si
     JOIN charging_sessions cs ON cs.id = si.session_id AND cs.billing_status = 'FINAL'
     JOIN stations s ON s.id = si.station_id
     LEFT JOIN invoice_lines il ON il.invoice_id = si.id
     WHERE si.period_date >= $1::date
       AND si.period_date < ($1::date + INTERVAL '1 month')
     GROUP BY s.owner_id, si.period_date, si.id
     ORDER BY s.owner_id, si.period_date, si.id`,
    [`${month}-01`]
  );
  return result.rows.map((row) => ({
    ownerId: row.owner_id,
    periodDate: row.period_date,
    energyDong: row.energy_dong,
    idleDong: row.idle_dong,
  }));
}

async function listRates(client, ownerIds, toDate) {
  if (!ownerIds.length) return [];
  const result = await client.query(
    `SELECT id::text, owner_id::text AS owner_id, share_bp, include_idle,
            effective_from::text AS effective_from
     FROM partner_share_rates
     WHERE owner_id = ANY($1::bigint[])
       AND effective_from <= $2::date
     ORDER BY owner_id, effective_from, id`,
    [ownerIds, toDate]
  );
  return result.rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    shareBp: row.share_bp,
    includeIdle: row.include_idle,
    effectiveFrom: row.effective_from,
  }));
}

async function insertStatement(client, { month, version, supersedesId, periodClosedAt, generatedBy, totals }) {
  const result = await client.query(
    `INSERT INTO settlement_statements (
       month, version, supersedes_id, period_closed_at, reconciliation_issue_count,
       revenue_dong, share_dong, platform_dong, generated_by
     )
     VALUES ($1::date, $2, $3, $4, 0, $5, $6, $7, $8)
     RETURNING id::text, TO_CHAR(month, 'YYYY-MM') AS month, version,
               supersedes_id::text, period_closed_at, reconciliation_issue_count,
               revenue_dong::text, share_dong::text, platform_dong::text, generated_by::text, generated_at`,
    [
      `${month}-01`,
      version,
      supersedesId,
      periodClosedAt,
      totals.revenueDong,
      totals.shareDong,
      totals.platformDong,
      generatedBy,
    ]
  );
  return result.rows[0];
}

async function insertLines(client, statementId, lines) {
  for (const line of lines) {
    await client.query(
      `INSERT INTO settlement_lines (
         statement_id, owner_id, rate_id, share_bp, include_idle,
         from_date, to_date, sessions, energy_dong, idle_dong, base_dong, share_dong
       )
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12)`,
      [
        statementId,
        line.ownerId,
        line.rateId,
        line.shareBp,
        line.includeIdle,
        line.fromDate,
        line.toDate,
        line.sessions,
        line.energyDong,
        line.idleDong,
        line.baseDong,
        line.shareDong,
      ]
    );
  }
}

async function findLatestForMonth(month) {
  const result = await pool.query(
    `SELECT id::text, TO_CHAR(month, 'YYYY-MM') AS month, version, supersedes_id::text,
            period_closed_at, reconciliation_issue_count, revenue_dong::text,
            share_dong::text, platform_dong::text, generated_by::text, generated_at
     FROM settlement_statements
     WHERE month = $1::date
     ORDER BY version DESC
     LIMIT 1`,
    [`${month}-01`]
  );
  return result.rows[0] ?? null;
}

async function listLines(statementId, ownerId = null) {
  const result = await pool.query(
    `SELECT owner_id::text, rate_id::text, share_bp, include_idle,
            TO_CHAR(from_date, 'YYYY-MM-DD') AS from_date,
            TO_CHAR(to_date, 'YYYY-MM-DD') AS to_date,
            sessions, energy_dong::text, idle_dong::text, base_dong::text, share_dong::text
     FROM settlement_lines
     WHERE statement_id = $1
       AND ($2::bigint IS NULL OR owner_id = $2)
     ORDER BY owner_id, from_date, id`,
    [statementId, ownerId]
  );
  return result.rows.map((row) => ({
    ownerId: row.owner_id,
    rateId: row.rate_id,
    shareBp: row.share_bp,
    includeIdle: row.include_idle,
    fromDate: row.from_date,
    toDate: row.to_date,
    sessions: row.sessions,
    energyDong: row.energy_dong,
    idleDong: row.idle_dong,
    baseDong: row.base_dong,
    shareDong: row.share_dong,
  }));
}

module.exports = {
  findPeriodForUpdate,
  latestStatement,
  listInvoices,
  listRates,
  insertStatement,
  insertLines,
  findLatestForMonth,
  listLines,
};
