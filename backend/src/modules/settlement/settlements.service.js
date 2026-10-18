const { pool } = require('../../db/pool');
const { withTransaction } = require('../../db/tx');
const { AppError, BadRequestError } = require('../../lib/errors');
const { computeSettlement } = require('./compute');
const audit = require('../audit/audit.repository');
const reconciliation = require('../reports/reconciliation');

function monthStart(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new BadRequestError('Tháng phải có định dạng YYYY-MM');
  }
  return `${month}-01`;
}

function serializeMoney(value) {
  return value.toString();
}

function serializeLine(line) {
  return {
    ...line,
    energy_dong: serializeMoney(line.energy_dong),
    idle_dong: serializeMoney(line.idle_dong),
    base_dong: serializeMoney(line.base_dong),
    share_dong: serializeMoney(line.share_dong),
  };
}

async function generate(actor, month) {
  const targetMonth = monthStart(month);
  return withTransaction(async (client) => {
    const periodResult = await client.query(
      `SELECT TO_CHAR(month, 'YYYY-MM-DD') AS month, status, closed_at
       FROM accounting_periods WHERE month = $1::date FOR UPDATE`,
      [targetMonth]
    );
    const period = periodResult.rows[0];
    if (!period || period.status !== 'CLOSED') {
      throw new AppError(409, 'PERIOD_NOT_CLOSED', 'Chỉ được lập bảng kê cho kỳ đã chốt');
    }

    const invoiceResult = await client.query(
      `SELECT s.owner_id, TO_CHAR(si.period_date, 'YYYY-MM-DD') AS period_date,
              COALESCE(SUM(il.amount_dong) FILTER (WHERE il.kind = 'ENERGY'), 0)::text AS energy_dong,
              COALESCE(SUM(il.amount_dong) FILTER (WHERE il.kind = 'IDLE'), 0)::text AS idle_dong
       FROM session_invoices si
       JOIN stations s ON s.id = si.station_id
       LEFT JOIN invoice_lines il ON il.invoice_id = si.id
       WHERE si.period_date >= $1::date
         AND si.period_date < ($1::date + INTERVAL '1 month')
       GROUP BY si.id, s.owner_id
       ORDER BY si.period_date, si.id`,
      [targetMonth]
    );
    const ratesResult = await client.query(
      `SELECT id, owner_id, share_bp, include_idle,
              TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from
       FROM partner_share_rates
       WHERE effective_from < ($1::date + INTERVAL '1 month')
       ORDER BY owner_id, effective_from, id`,
      [targetMonth]
    );
    const computed = computeSettlement({
      month,
      invoices: invoiceResult.rows.map((row) => ({
        ...row,
        owner_id: Number(row.owner_id),
      })),
      rates: ratesResult.rows,
    });

    const previousResult = await client.query(
      `SELECT id, version, generated_at FROM settlement_statements
       WHERE month = $1::date ORDER BY version DESC LIMIT 1`,
      [targetMonth]
    );
    const previous = previousResult.rows[0] || null;

    if (previous && new Date(period.closed_at).getTime() <= new Date(previous.generated_at).getTime()) {
      const existing = await getStatement(actor, month);
      return { duplicate: true, ...existing };
    }

    const version = previous ? Number(previous.version) + 1 : 1;

    const monthYear = targetMonth.slice(0, 7);
    const lastDayOfMonth = new Date(Number(monthYear.slice(0, 4)), Number(monthYear.slice(5, 7)), 0).getDate();
    const fromStr = `${monthYear}-01`;
    const toStr = `${monthYear}-${String(lastDayOfMonth).padStart(2, '0')}`;
    let reconIssueCount = 0;
    try {
      const recon = await reconciliation.build({ from: fromStr, to: toStr });
      reconIssueCount = recon?.summary?.issueCount ?? 0;
    } catch {
      reconIssueCount = 0;
    }

    const statementResult = await client.query(
      `INSERT INTO settlement_statements
         (month, version, supersedes_id, period_closed_at, reconciliation_issue_count,
          revenue_dong, share_dong, platform_dong, generated_by)
       VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, TO_CHAR(month, 'YYYY-MM') AS month, version, supersedes_id,
                 period_closed_at, reconciliation_issue_count, revenue_dong,
                 share_dong, platform_dong, generated_by, generated_at`,
      [
        targetMonth,
        version,
        previous?.id || null,
        period.closed_at,
        reconIssueCount,
        serializeMoney(computed.summary.revenue_dong),
        serializeMoney(computed.summary.share_dong),
        serializeMoney(computed.summary.platform_dong),
        actor.id,
      ]
    );
    const statement = statementResult.rows[0];
    const lines = [];
    for (const line of computed.lines) {
      const inserted = await client.query(
        `INSERT INTO settlement_lines
           (statement_id, owner_id, rate_id, share_bp, include_idle, from_date,
            to_date, sessions, energy_dong, idle_dong, base_dong, share_dong)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          statement.id,
          line.owner_id,
          line.rate_id,
          line.share_bp,
          line.include_idle,
          line.from_date,
          line.to_date,
          line.sessions,
          serializeMoney(line.energy_dong),
          serializeMoney(line.idle_dong),
          serializeMoney(line.base_dong),
          serializeMoney(line.share_dong),
        ]
      );
      lines.push({ id: inserted.rows[0].id, ...serializeLine(line) });
    }

    await audit.record(
      actor.id,
      'SETTLEMENT_GENERATED',
      'settlement_statement',
      statement.id,
      {
        month,
        version: statement.version,
        revenue_dong: statement.revenue_dong,
        share_dong: statement.share_dong,
        platform_dong: statement.platform_dong,
        reconciliation_issue_count: reconIssueCount,
      },
      actor.ip,
      client
    );

    return {
      statement,
      summary: {
        revenue_dong: serializeMoney(computed.summary.revenue_dong),
        share_dong: serializeMoney(computed.summary.share_dong),
        platform_dong: serializeMoney(computed.summary.platform_dong),
      },
      lines,
    };
  });
}

async function getStatement(actor, month) {
  const targetMonth = monthStart(month);
  const privileged = actor.roles?.some((role) => ['ADMIN', 'ACCOUNTANT'].includes(role)) || false;
  const result = await pool.query(
    `SELECT ss.id, TO_CHAR(ss.month, 'YYYY-MM') AS month, ss.version,
            ss.supersedes_id, ss.period_closed_at, ss.reconciliation_issue_count,
            ss.revenue_dong, ss.share_dong, ss.platform_dong, ss.generated_at
     FROM settlement_statements ss
     WHERE ss.month = $1::date
       AND ($2::boolean OR EXISTS (
         SELECT 1 FROM settlement_lines sl
         WHERE sl.statement_id = ss.id AND sl.owner_id = $3
       ))
     ORDER BY ss.version DESC LIMIT 1`,
    [targetMonth, privileged, actor.id]
  );
  if (!result.rowCount) throw new AppError(404, 'SETTLEMENT_NOT_FOUND', 'Không tìm thấy bảng kê');

  const row = result.rows[0];
  const linesResult = await pool.query(
    `SELECT id, owner_id, rate_id, share_bp, include_idle,
            TO_CHAR(from_date, 'YYYY-MM-DD') AS from_date,
            TO_CHAR(to_date, 'YYYY-MM-DD') AS to_date, sessions,
            energy_dong, idle_dong, base_dong, share_dong
     FROM settlement_lines
     WHERE statement_id = $1 AND ($2::boolean OR owner_id = $3)
     ORDER BY owner_id, from_date`,
    [row.id, privileged, actor.id]
  );
  if (privileged) return { statement: row, lines: linesResult.rows };

  const revenue = linesResult.rows.reduce(
    (sum, line) => sum + BigInt(line.energy_dong) + BigInt(line.idle_dong),
    0n
  );
  const share = linesResult.rows.reduce((sum, line) => sum + BigInt(line.share_dong), 0n);
  const statement = { ...row };
  delete statement.revenue_dong;
  delete statement.share_dong;
  delete statement.platform_dong;
  return {
    statement,
    summary: {
      revenue_dong: serializeMoney(revenue),
      share_dong: serializeMoney(share),
      platform_dong: serializeMoney(revenue - share),
    },
    lines: linesResult.rows,
  };
}

module.exports = { generate, getStatement };
