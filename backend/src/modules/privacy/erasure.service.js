const crypto = require('node:crypto');
const { withTransaction } = require('../../db/tx');
const { hashPassword } = require('../../lib/password');
const { AppError, ConflictError, NotFoundError } = require('../../lib/errors');
const audit = require('../audit/audit.repository');

async function requestErasure(actor) {
  return withTransaction(async (client) => {
    const user = await client.query('SELECT email FROM users WHERE id = $1 FOR UPDATE', [actor.id]);
    if (!user.rowCount) throw new NotFoundError('Không tìm thấy tài khoản');
    if (user.rows[0].email === `erased-${actor.id}@erased.invalid`) {
      throw new ConflictError('Tài khoản đã được ẩn danh hóa');
    }
    let created;
    try {
      created = await client.query(
        `INSERT INTO data_erasure_requests (driver_id)
         VALUES ($1)
         RETURNING id, status, requested_at`,
        [actor.id]
      );
    } catch (error) {
      if (error.code === '23505') throw new ConflictError('Đã có yêu cầu xóa dữ liệu đang chờ xử lý');
      throw error;
    }
    await audit.record(actor.id, 'DATA_ERASURE_REQUESTED', 'data_erasure_request', created.rows[0].id, {}, actor.ip, client);
    return created.rows[0];
  });
}

async function listOwnRequests(driverId) {
  const { pool } = require('../../db/pool');
  const result = await pool.query(
    `SELECT id, status, requested_at, decided_at, completed_at, result
     FROM data_erasure_requests
     WHERE driver_id = $1
     ORDER BY requested_at DESC, id DESC`,
    [driverId]
  );
  return result.rows;
}

async function listRequests() {
  const { pool } = require('../../db/pool');
  const result = await pool.query(
    `SELECT id, status, requested_at, decided_at, completed_at, result
     FROM data_erasure_requests
     ORDER BY requested_at ASC, id ASC`
  );
  return result.rows;
}

async function decideRequest(client, id) {
  const result = await client.query(
    'SELECT id, driver_id, status FROM data_erasure_requests WHERE id = $1 FOR UPDATE',
    [id]
  );
  if (!result.rowCount) throw new NotFoundError('Không tìm thấy yêu cầu xóa dữ liệu');
  if (result.rows[0].status !== 'REQUESTED') {
    throw new AppError(409, 'ERASURE_REQUEST_NOT_OPEN', 'Yêu cầu không còn ở trạng thái chờ xử lý');
  }
  return result.rows[0];
}

async function approve(actor, id) {
  return withTransaction(async (client) => {
    const request = await decideRequest(client, id);
    const userResult = await client.query(
      'SELECT id, email FROM users WHERE id = $1 FOR UPDATE',
      [request.driver_id]
    );
    if (!userResult.rowCount) throw new NotFoundError('Không tìm thấy tài khoản');
    const user = userResult.rows[0];
    const wallet = await client.query(
      'SELECT balance_dong FROM wallets WHERE driver_id = $1 FOR UPDATE',
      [user.id]
    );
    const balance = BigInt(wallet.rows[0]?.balance_dong ?? 0);
    if (balance > 0n) throw new AppError(409, 'BLOCKED_BALANCE', 'Cần xử lý hoàn tiền trước khi duyệt xóa dữ liệu');
    if (balance < 0n) throw new AppError(409, 'BLOCKED_DEBT', 'Tài khoản còn nợ; cần xử lý số dư trước khi duyệt');

    const active = await client.query(
      `SELECT id
       FROM charging_sessions
       WHERE driver_id = $1 AND status = 'CHARGING'
       ORDER BY id
       FOR UPDATE`,
      [user.id]
    );
    if (active.rowCount) {
      const error = new AppError(409, 'BLOCKED_ACTIVE', 'Tài khoản còn phiên sạc đang hoạt động');
      error.details = active.rows.map((row) => ({ sessionId: String(row.id) }));
      throw error;
    }

    const passwordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
    const sessions = await client.query(
      `UPDATE charging_sessions
       SET driver_id = NULL, id_tag_id = NULL, id_tag_masked = 'ER-' || upper(to_hex(id)),
           updated_at = CURRENT_TIMESTAMP
       WHERE driver_id = $1`,
      [user.id]
    );
    const invoices = await client.query(
      'UPDATE session_invoices SET driver_id = NULL WHERE driver_id = $1',
      [user.id]
    );
    const tags = await client.query('DELETE FROM id_tags WHERE user_id = $1', [user.id]);
    const notifications = await client.query('DELETE FROM notifications WHERE user_id = $1', [user.id]);
    const emails = await client.query('DELETE FROM email_outbox WHERE user_id = $1', [user.id]);
    await client.query(
      `UPDATE users
       SET email = $2, name = 'Đã xoá', password_hash = $3, token_version = token_version + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id, `erased-${user.id}@erased.invalid`, passwordHash]
    );
    const result = {
      sessions: sessions.rowCount,
      invoices: invoices.rowCount,
      idTags: tags.rowCount,
      notifications: notifications.rowCount,
      emails: emails.rowCount,
    };
    const completed = await client.query(
      `UPDATE data_erasure_requests
       SET status = 'COMPLETED', decided_by = $2, decided_at = CURRENT_TIMESTAMP,
           completed_at = CURRENT_TIMESTAMP, result = $3::jsonb
       WHERE id = $1
       RETURNING id, status, requested_at, decided_at, completed_at, result`,
      [id, actor.id, JSON.stringify(result)]
    );
    await audit.record(actor.id, 'DATA_ERASURE_COMPLETED', 'data_erasure_request', id, result, actor.ip, client);
    return completed.rows[0];
  });
}

async function reject(actor, id, reason) {
  return withTransaction(async (client) => {
    await decideRequest(client, id);
    const result = await client.query(
      `UPDATE data_erasure_requests
       SET status = 'REJECTED', decided_by = $2, decided_at = CURRENT_TIMESTAMP, decision_reason = $3
       WHERE id = $1
       RETURNING id, status, requested_at, decided_at`,
      [id, actor.id, reason]
    );
    await audit.record(actor.id, 'DATA_ERASURE_REJECTED', 'data_erasure_request', id, { decision: 'REJECTED' }, actor.ip, client);
    return result.rows[0];
  });
}

module.exports = { requestErasure, listOwnRequests, listRequests, approve, reject };
