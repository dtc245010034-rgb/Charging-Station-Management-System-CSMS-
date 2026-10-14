const { pool } = require('../../db/pool');
const { NotFoundError } = require('../../lib/errors');
const { denyOrNotFound } = require('../../lib/ownership');
const { getMinBalanceDong } = require('./min-balance.service');

const PAGE_SIZE = 50;

async function ensureDriverAccess(actor, driverId, db) {
  const roles = actor.roles || [actor.role];
  const canReadAny = roles.includes('ADMIN') || roles.includes('ACCOUNTANT');
  const ownerId = canReadAny ? null : actor.id;
  const driver = await db.query(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1
       AND r.code = 'DRIVER'
       AND ($2::bigint IS NULL OR u.id = $2)
     LIMIT 1`,
    [driverId, ownerId]
  );
  if (driver.rows[0]) return ownerId;

  if (!canReadAny && roles.includes('DRIVER')) {
    await denyOrNotFound(actor, 'wallet', driverId, async (id) => {
      const exists = await db.query(
        `SELECT 1
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE u.id = $1 AND r.code = 'DRIVER'
         LIMIT 1`,
        [id]
      );
      return exists.rowCount > 0;
    }, 'Không tìm thấy ví tài xế');
  }

  throw new NotFoundError('Không tìm thấy ví tài xế');
}

async function getWallet(actor, driverId, db = pool) {
  const ownerId = await ensureDriverAccess(actor, driverId, db);
  const result = await db.query(
    `SELECT balance_dong, locked
     FROM wallets
     WHERE driver_id = $1
       AND ($2::bigint IS NULL OR driver_id = $2)`,
    [driverId, ownerId]
  );
  const wallet = result.rows[0];
  const balanceDong = wallet?.balance_dong ?? '0';
  return {
    balanceDong: String(balanceDong),
    inDebt: BigInt(balanceDong) < 0n,
    locked: Boolean(wallet?.locked),
    minBalanceDong: String(await getMinBalanceDong(db)),
  };
}

async function listTransactions(actor, driverId, page = 1, db = pool) {
  const ownerId = await ensureDriverAccess(actor, driverId, db);
  const offset = (page - 1) * PAGE_SIZE;
  const result = await db.query(
    `SELECT id, entry_type, amount_dong, balance_after_dong,
            session_id, topup_id, created_at
     FROM wallet_ledger
     WHERE driver_id = $1
       AND ($2::bigint IS NULL OR driver_id = $2)
     ORDER BY created_at DESC, id DESC
     LIMIT $3 OFFSET $4`,
    [driverId, ownerId, PAGE_SIZE + 1, offset]
  );
  const rows = result.rows.slice(0, PAGE_SIZE);
  return {
    items: rows.map((row) => ({
      id: String(row.id),
      type: row.entry_type,
      amountDong: String(row.amount_dong),
      balanceAfterDong: String(row.balance_after_dong),
      at: new Date(row.created_at).toISOString(),
      sessionId: row.session_id == null ? null : String(row.session_id),
      topupId: row.topup_id == null ? null : String(row.topup_id),
    })),
    page,
    pageSize: PAGE_SIZE,
    hasMore: result.rows.length > PAGE_SIZE,
  };
}

module.exports = { getWallet, listTransactions, PAGE_SIZE };
