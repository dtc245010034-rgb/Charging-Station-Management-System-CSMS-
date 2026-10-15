const { pool } = require('../../db/pool');
const { withTransaction } = require('../../db/tx');
const { AppError, BadRequestError } = require('../../lib/errors');
const audit = require('../audit/audit.repository');

class PeriodBlockedError extends AppError {
  constructor(blockingSessions) {
    super(409, 'PERIOD_BLOCKED', 'Còn phiên sạc bất thường hoặc chưa hoàn tất hoá đơn trong kỳ');
    this.blockingSessions = blockingSessions;
    this.details = { blockingSessions };
  }
}

async function listPeriods() {
  const result = await pool.query(
    `SELECT id, TO_CHAR(month, 'YYYY-MM') AS month, status, closed_by, closed_at, reopened_by, reopened_at, reopen_reason, created_at, updated_at
     FROM accounting_periods
     ORDER BY month DESC`
  );
  return result.rows;
}

async function closePeriod(actor, yearMonth) {
  const monthDate = `${yearMonth}-01`;

  // Kiểm tra tháng đã kết thúc chưa
  // Ngày kết thúc của tháng (cuối ngày cuối tháng theo giờ địa phương / trạm)
  // Tháng chỉ được chốt sau khi tháng đã kết thúc hoàn toàn.
  const checkMonthEnd = await pool.query(
    "SELECT (date_trunc('month', $1::date) + interval '1 month' <= CURRENT_DATE) AS is_ended",
    [monthDate]
  );
  if (!checkMonthEnd.rows[0]?.is_ended) {
    throw new BadRequestError('Chỉ có thể chốt tháng đã kết thúc');
  }

  return withTransaction(async (client) => {
    // Khoá bản ghi kỳ nếu đã có
    const existingRes = await client.query(
      'SELECT id, status FROM accounting_periods WHERE month = $1 FOR UPDATE',
      [monthDate]
    );
    const existing = existingRes.rows[0];
    if (existing?.status === 'CLOSED') {
      throw new AppError(409, 'PERIOD_ALREADY_CLOSED', 'Kỳ kế toán này đã được chốt');
    }

    // Kiểm tra còn phiên bất thường chưa xử lý trong tháng:
    // ABNORMAL; hoặc COMPLETED mà billing_status ∈ {NULL, REVIEW, ERROR, WAITING_IDLE}
    // Dựa vào ngày địa phương của stopped_at hoặc started_at trong tháng
    const blockingRes = await client.query(
      `SELECT cs.id, cs.status, cs.billing_status, cs.billing_reason, cs.charge_point_id, cs.connector_no
       FROM charging_sessions cs
       JOIN charge_points cp ON cp.id = cs.charge_point_id
       JOIN stations s ON s.id = cp.station_id
       WHERE (
         (cs.stopped_at IS NOT NULL AND date_trunc('month', (cs.stopped_at AT TIME ZONE s.timezone)::date)::date = $1::date)
         OR
         (cs.stopped_at IS NULL AND date_trunc('month', (cs.started_at AT TIME ZONE s.timezone)::date)::date = $1::date)
       )
       AND (
         cs.status = 'ABNORMAL'
         OR (
           cs.status = 'COMPLETED'
           AND (cs.billing_status IS NULL OR cs.billing_status IN ('REVIEW', 'ERROR', 'WAITING_IDLE'))
         )
       )`,
      [monthDate]
    );

    if (blockingRes.rowCount > 0) {
      throw new PeriodBlockedError(blockingRes.rows);
    }

    let periodRow;
    if (existing) {
      const updateRes = await client.query(
        `UPDATE accounting_periods
         SET status = 'CLOSED', closed_by = $1, closed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [actor.id, existing.id]
      );
      periodRow = updateRes.rows[0];
    } else {
      const insertRes = await client.query(
        `INSERT INTO accounting_periods (month, status, closed_by, closed_at)
         VALUES ($1, 'CLOSED', $2, CURRENT_TIMESTAMP)
         RETURNING *`,
        [monthDate, actor.id]
      );
      periodRow = insertRes.rows[0];
    }

    await audit.record(actor.id, 'PERIOD_CLOSED', 'accounting_periods', periodRow.id, {
      month: yearMonth,
    }, actor.ip, client, 'COMPLETED');

    return {
      id: periodRow.id,
      month: yearMonth,
      status: 'CLOSED',
      closedBy: periodRow.closed_by,
      closedAt: periodRow.closed_at,
    };
  });
}

async function reopenPeriod(actor, yearMonth, reason) {
  const monthDate = `${yearMonth}-01`;

  return withTransaction(async (client) => {
    const existingRes = await client.query(
      'SELECT id, status FROM accounting_periods WHERE month = $1 FOR UPDATE',
      [monthDate]
    );
    const existing = existingRes.rows[0];
    if (!existing || existing.status !== 'CLOSED') {
      throw new AppError(404, 'PERIOD_NOT_CLOSED', 'Kỳ này chưa chốt hoặc không tồn tại');
    }

    const updateRes = await client.query(
      `UPDATE accounting_periods
       SET status = 'OPEN', reopened_by = $1, reopened_at = CURRENT_TIMESTAMP, reopen_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [actor.id, reason, existing.id]
    );
    const periodRow = updateRes.rows[0];

    await audit.record(actor.id, 'PERIOD_REOPENED', 'accounting_periods', periodRow.id, {
      month: yearMonth,
      reason,
    }, actor.ip, client, 'COMPLETED');

    return {
      id: periodRow.id,
      month: yearMonth,
      status: 'OPEN',
      reopenedBy: periodRow.reopened_by,
      reopenedAt: periodRow.reopened_at,
      reopenReason: periodRow.reopen_reason,
    };
  });
}

module.exports = {
  listPeriods,
  closePeriod,
  reopenPeriod,
  PeriodBlockedError,
};
