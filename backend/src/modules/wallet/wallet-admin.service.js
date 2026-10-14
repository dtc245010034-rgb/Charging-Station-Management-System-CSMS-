const { pool } = require('../../db/pool');
const { AppError, NotFoundError } = require('../../lib/errors');
const audit = require('../audit/audit.repository');
const { withTransaction } = require('../../db/tx');
const { postEntry } = require('./ledger.service');

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

module.exports = { manualTopup };
