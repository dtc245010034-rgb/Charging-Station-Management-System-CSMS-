const { pool } = require('../../db/pool');
const { withTransaction } = require('../../db/tx');
const audit = require('../audit/audit.repository');
const { NotFoundError, ForbiddenError, ConflictError, AppError } = require('../../lib/errors');

async function listPartners(actor) {
  const isPrivileged = actor?.roles?.includes('ADMIN') || actor?.roles?.includes('ACCOUNTANT') ||
                       actor?.role === 'ADMIN' || actor?.role === 'ACCOUNTANT';

  const queryText = `
    SELECT DISTINCT ON (u.id)
      u.id, u.name, u.email,
      r.id AS rate_id, r.share_bp, r.include_idle,
      TO_CHAR(r.effective_from, 'YYYY-MM-DD') AS effective_from,
      r.note, r.created_at
    FROM users u
    JOIN stations s ON s.owner_id = u.id
    LEFT JOIN LATERAL (
      SELECT id, share_bp, include_idle, effective_from, note, created_at
      FROM partner_share_rates
      WHERE owner_id = u.id AND effective_from <= CURRENT_DATE
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
    ) r ON true
    ${isPrivileged ? '' : 'WHERE u.id = $1'}
    ORDER BY u.id ASC
  `;
  const partnersResult = await pool.query(queryText, isPrivileged ? [] : [actor.id]);
  return partnersResult.rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    email: row.email,
    current_rate: row.rate_id ? {
      id: Number(row.rate_id),
      share_bp: Number(row.share_bp),
      include_idle: Boolean(row.include_idle),
      effective_from: row.effective_from,
      note: row.note,
      created_at: row.created_at,
    } : null,
  }));
}

async function listShareRates(actor, ownerId) {
  const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [ownerId]);
  if (userCheck.rowCount === 0) {
    throw new NotFoundError('Không tìm thấy người dùng');
  }

  const isPrivileged = actor?.roles?.includes('ADMIN') || actor?.roles?.includes('ACCOUNTANT') ||
                       actor?.role === 'ADMIN' || actor?.role === 'ACCOUNTANT';

  if (!isPrivileged && Number(actor.id) !== Number(ownerId)) {
    throw new ForbiddenError('Truy cập bị từ chối');
  }

  const result = await pool.query(
    `SELECT id, owner_id, share_bp, include_idle, TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from,
            created_by, created_at, note
     FROM partner_share_rates
     WHERE owner_id = $1
     ORDER BY effective_from DESC, id DESC`,
    [ownerId]
  );

  return result.rows.map((r) => ({
    id: Number(r.id),
    owner_id: Number(r.owner_id),
    share_bp: Number(r.share_bp),
    include_idle: Boolean(r.include_idle),
    effective_from: r.effective_from,
    created_by: r.created_by ? Number(r.created_by) : null,
    created_at: r.created_at,
    note: r.note,
  }));
}

async function createShareRate(actor, ownerId, { shareBp, includeIdle = true, effectiveFrom, note }) {
  return withTransaction(async (client) => {
    const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [ownerId]);
    if (userCheck.rowCount === 0) {
      throw new NotFoundError('Không tìm thấy người dùng');
    }

    // Kiểm tra effective_from có nằm trong kỳ đã chốt không
    const closedCheck = await client.query(
      'SELECT is_period_closed($1::date) AS is_closed',
      [effectiveFrom]
    );
    if (closedCheck.rows[0]?.is_closed) {
      throw new AppError(409, 'RATE_IN_CLOSED_PERIOD', 'Không thể đặt ngày hiệu lực trong kỳ kế toán đã chốt');
    }

    // Kiểm tra trùng ngày hiệu lực
    const existCheck = await client.query(
      'SELECT 1 FROM partner_share_rates WHERE owner_id = $1 AND effective_from = $2::date',
      [ownerId, effectiveFrom]
    );
    if (existCheck.rowCount > 0) {
      throw new ConflictError('Tỉ lệ chia cho ngày hiệu lực này đã tồn tại');
    }

    const res = await client.query(
      `INSERT INTO partner_share_rates (owner_id, share_bp, include_idle, effective_from, created_by, note)
       VALUES ($1, $2, $3, $4::date, $5, $6)
       RETURNING id, owner_id, share_bp, include_idle, TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from, created_by, created_at, note`,
      [ownerId, shareBp, includeIdle, effectiveFrom, actor.id, note || null]
    );

    const row = res.rows[0];

    // Ghi audit log tuân thủ K6 (không PII, không email/name)
    await audit.record(
      actor?.id,
      'PARTNER_RATE_CREATED',
      'partner_share_rates',
      row.id,
      {
        owner_id: Number(row.owner_id),
        share_bp: Number(row.share_bp),
        include_idle: Boolean(row.include_idle),
        effective_from: row.effective_from,
      },
      actor?.ip || null,
      client
    );

    return {
      id: Number(row.id),
      owner_id: Number(row.owner_id),
      share_bp: Number(row.share_bp),
      include_idle: Boolean(row.include_idle),
      effective_from: row.effective_from,
      created_by: row.created_by ? Number(row.created_by) : null,
      created_at: row.created_at,
      note: row.note,
    };
  });
}

module.exports = {
  listPartners,
  listShareRates,
  createShareRate,
};
