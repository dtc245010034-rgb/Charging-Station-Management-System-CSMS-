const { pool } = require('../../db/pool');
const { NotFoundError, BadRequestError } = require('../../lib/errors');

async function listNotifications(userId, unreadOnly = false, db = pool) {
  const result = await db.query(
    `SELECT id, kind, session_id, payload, created_at, read_at
     FROM notifications
     WHERE user_id = $1 AND ($2::boolean = false OR read_at IS NULL)
     ORDER BY created_at DESC, id DESC
     LIMIT 50`,
    [userId, unreadOnly]
  );
  const count = await db.query(
    'SELECT count(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId]
  );
  return {
    notifications: result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      sessionId: row.session_id,
      payload: row.payload,
      createdAt: row.created_at,
      readAt: row.read_at,
    })),
    unreadCount: count.rows[0].count,
  };
}

async function markNotificationRead(userId, notificationId, db = pool) {
  const id = String(notificationId);
  if (!/^\d{1,19}$/.test(id) || BigInt(id) < 1n || BigInt(id) > 9223372036854775807n) {
    throw new BadRequestError('Mã thông báo không hợp lệ');
  }
  const result = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id = $1 AND user_id = $2
     RETURNING id, kind, session_id, payload, created_at, read_at`,
    [notificationId, userId]
  );
  const row = result.rows[0];
  if (!row) throw new NotFoundError('Không tìm thấy thông báo');
  return {
    notification: {
      id: row.id,
      kind: row.kind,
      sessionId: row.session_id,
      payload: row.payload,
      createdAt: row.created_at,
      readAt: row.read_at,
    },
  };
}

module.exports = { listNotifications, markNotificationRead };
