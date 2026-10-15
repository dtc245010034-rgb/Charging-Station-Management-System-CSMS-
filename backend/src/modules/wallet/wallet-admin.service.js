const { pool } = require('../../db/pool');
const { AppError, NotFoundError } = require('../../lib/errors');
const audit = require('../audit/audit.repository');
const { withTransaction } = require('../../db/tx');
const { postEntry } = require('./ledger.service');

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function requireDriver(client, driverId) {
  const result = await client.query(
    `SELECT u.id
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1 AND r.code = 'DRIVER'
     LIMIT 1`,
    [driverId]
  );
  if (!result.rows[0]) throw new NotFoundError('Không tìm thấy tài xế');
}

async function searchDrivers(query, db = pool) {
  const search = query.trim();
  if (!search) return { items: [], hasMore: false };

  const numericId = /^\d+$/.test(search) && BigInt(search) <= 9223372036854775807n
    ? BigInt(search).toString()
    : null;
  const result = await db.query(
    `SELECT u.id, u.name, u.email,
            COALESCE(w.balance_dong, 0)::text AS balance_dong,
            COALESCE(w.locked, FALSE) AS locked
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id AND r.code = 'DRIVER'
     LEFT JOIN wallets w ON w.driver_id = u.id
     WHERE ($1::bigint IS NOT NULL AND u.id = $1)
        OR u.email ILIKE $2 ESCAPE E'\\\\'
     ORDER BY u.id DESC
     LIMIT 51`,
    [numericId, `%${escapeLike(search)}%`]
  );
  return {
    items: result.rows.slice(0, 50).map((row) => ({
      driverId: String(row.id),
      name: row.name,
      email: row.email,
      balanceDong: String(row.balance_dong),
      locked: Boolean(row.locked),
    })),
    hasMore: result.rows.length > 50,
  };
}

async function manualTopup(actor, driverId, { amountDong, receiptCode, note }, ip = null, db = pool) {
  return withTransaction(async (client) => {
    await requireDriver(client, driverId);
    const entry = await postEntry(client, {
      driverId,
      entryType: 'TOPUP_MANUAL',
      amountDong,
      receiptCode,
      reason: note,
      createdBy: actor.id,
    });
    if (entry.duplicated) {
      throw new AppError(409, 'RECEIPT_ALREADY_USED', 'Mã phiếu thu đã được sử dụng');
    }

    await audit.record(actor.id, 'WALLET_TOPUP_MANUAL', 'wallet', driverId, {
      driver_id: driverId,
      amount_dong: amountDong.toString(),
      reason: note,
      receipt_code: receiptCode,
    }, ip, client, 'SUCCESS');
    return { balanceDong: String(entry.wallet.balance_dong) };
  }, db);
}

async function adjustWallet(actor, driverId, { amountDong, reason }, ip = null, db = pool) {
  return withTransaction(async (client) => {
    await requireDriver(client, driverId);
    const entry = await postEntry(client, {
      driverId,
      entryType: 'ADJUSTMENT',
      amountDong,
      reason,
      createdBy: actor.id,
    });
    await audit.record(actor.id, 'WALLET_ADJUST', 'wallet', driverId, {
      driver_id: driverId,
      amount_dong: amountDong.toString(),
      reason,
    }, ip, client, 'SUCCESS');
    return { balanceDong: String(entry.wallet.balance_dong) };
  }, db);
}

async function unlockWallet(actor, driverId, { reason }, ip = null, db = pool) {
  return withTransaction(async (client) => {
    await requireDriver(client, driverId);
    const result = await client.query(
      'SELECT locked FROM wallets WHERE driver_id = $1 FOR UPDATE',
      [driverId]
    );
    if (!result.rows[0]?.locked) {
      throw new AppError(409, 'WALLET_NOT_LOCKED', 'Ví tài xế hiện không bị khóa');
    }

    await client.query(
      `UPDATE wallets
       SET locked = FALSE, locked_reason = NULL, locked_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE driver_id = $1`,
      [driverId]
    );
    await audit.record(actor.id, 'WALLET_UNLOCK', 'wallet', driverId, {
      driver_id: driverId,
      reason,
    }, ip, client, 'SUCCESS');
    return { unlocked: true };
  }, db);
}

module.exports = { searchDrivers, manualTopup, adjustWallet, unlockWallet };
