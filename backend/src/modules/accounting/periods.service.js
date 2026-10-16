const { withTransaction } = require('../../db/tx');
const audit = require('../audit/audit.repository');
const { AppError, BadRequestError, NotFoundError } = require('../../lib/errors');
const { pool } = require('../../db/pool');

function monthDate(month) {
  return `${month}-01`;
}

async function list() {
  const result = await pool.query(
    `SELECT id, TO_CHAR(month, 'YYYY-MM-DD') AS month, status,
            closed_by, closed_at, reopened_by, reopened_at, reopen_reason
     FROM accounting_periods
     ORDER BY month DESC`
  );
  return result.rows;
}

async function close(actor, month) {
  const targetMonth = monthDate(month);
  const current = await pool.query(
    "SELECT date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS month"
  );
  if (targetMonth >= current.rows[0].month.toISOString().slice(0, 10)) {
    throw new BadRequestError('Chỉ được chốt kỳ đã kết thúc');
  }

  return withTransaction(async (client) => {
    await client.query(
      "INSERT INTO accounting_periods (month) VALUES ($1::date) ON CONFLICT (month) DO NOTHING",
      [targetMonth]
    );
    const periodResult = await client.query(
      'SELECT id, TO_CHAR(month, \'YYYY-MM-DD\') AS month, status FROM accounting_periods WHERE month = $1::date FOR UPDATE',
      [targetMonth]
    );
    const period = periodResult.rows[0];
    if (period.status === 'CLOSED') return period;

    const blockers = await client.query(
      `SELECT cs.id, cs.status, cs.billing_status, cs.billing_reason
       FROM charging_sessions cs
       JOIN charge_points cp ON cp.id = cs.charge_point_id
       JOIN stations s ON s.id = cp.station_id
       WHERE date_trunc('month',
               COALESCE(cs.stopped_at, cs.started_at) AT TIME ZONE s.timezone
             )::date = $1::date
         AND (
           cs.status = 'ABNORMAL'
           OR (cs.status = 'COMPLETED' AND (
             cs.billing_status IS NULL
             OR cs.billing_status = ANY($2::text[])
           ))
         )
       ORDER BY cs.id
       LIMIT 5000`,
      [targetMonth, ['REVIEW', 'ERROR', 'WAITING_IDLE']]
    );
    if (blockers.rowCount) {
      const error = new AppError(409, 'PERIOD_HAS_BLOCKERS', 'Còn phiên chưa xử lý trong kỳ');
      error.details = blockers.rows;
      throw error;
    }

    const updated = await client.query(
      `UPDATE accounting_periods
       SET status = 'CLOSED', closed_by = $2, closed_at = CURRENT_TIMESTAMP,
           reopened_by = NULL, reopened_at = NULL, reopen_reason = NULL
       WHERE id = $1
       RETURNING id, TO_CHAR(month, 'YYYY-MM-DD') AS month, status, closed_by, closed_at`,
      [period.id, actor.id]
    );
    await audit.record(actor.id, 'PERIOD_CLOSED', 'accounting_period', period.id, { month }, actor.ip, client);
    return updated.rows[0];
  });
}

async function reopen(actor, month, reason) {
  const targetMonth = monthDate(month);
  return withTransaction(async (client) => {
    const periodResult = await client.query(
      'SELECT id FROM accounting_periods WHERE month = $1::date FOR UPDATE',
      [targetMonth]
    );
    if (!periodResult.rowCount) throw new NotFoundError('Không tìm thấy kỳ kế toán');
    const periodId = periodResult.rows[0].id;
    const updated = await client.query(
      `UPDATE accounting_periods
       SET status = 'OPEN', reopened_by = $2, reopened_at = CURRENT_TIMESTAMP, reopen_reason = $3
       WHERE id = $1 AND status = 'CLOSED'
       RETURNING id, TO_CHAR(month, 'YYYY-MM-DD') AS month, status, reopened_by, reopened_at, reopen_reason`,
      [periodId, actor.id, reason]
    );
    if (!updated.rowCount) throw new AppError(409, 'PERIOD_NOT_CLOSED', 'Kỳ kế toán chưa được chốt');
    await audit.record(actor.id, 'PERIOD_REOPENED', 'accounting_period', periodId, { month, reason }, actor.ip, client);
    return updated.rows[0];
  });
}

module.exports = { list, close, reopen };
