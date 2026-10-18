const { AppError, BadRequestError } = require('../../lib/errors');

const ENTRY_TYPES = new Set([
  'TOPUP_GATEWAY',
  'TOPUP_MANUAL',
  'SESSION_DEBIT',
  'ADJUSTMENT',
  'RESERVATION_FEE',
  'SUBSCRIPTION_FEE',
]);
const DEBT_ENTRY_TYPES = new Set(['SESSION_DEBIT', 'RESERVATION_FEE']);
const LOCKED_WALLET_ENTRY_TYPES = new Set(['SESSION_DEBIT', 'TOPUP_MANUAL', 'ADJUSTMENT']);
const BIGINT_MIN = -9223372036854775808n;
const BIGINT_MAX = 9223372036854775807n;

class WalletLockedError extends AppError {
  constructor() {
    super(409, 'WALLET_LOCKED', 'Ví đang bị khóa để kiểm tra sổ cái');
  }
}

class InsufficientBalanceError extends AppError {
  constructor() {
    super(409, 'INSUFFICIENT_BALANCE', 'Số dư ví không đủ cho giao dịch');
  }
}

function validateEntry({ driverId, entryType, amountDong }) {
  if (!driverId) throw new BadRequestError('Thiếu mã tài xế');
  if (!ENTRY_TYPES.has(entryType)) throw new BadRequestError('Loại giao dịch ví không hợp lệ');
  const validAmount = typeof amountDong === 'bigint'
    || (typeof amountDong === 'number' && Number.isSafeInteger(amountDong))
    || (typeof amountDong === 'string' && /^-?\d+$/.test(amountDong));
  if (!validAmount || (BigInt(amountDong) === 0n && entryType !== 'SESSION_DEBIT')) {
    throw new BadRequestError('Số tiền giao dịch ví phải là số nguyên hợp lệ');
  }
  const amount = BigInt(amountDong);
  if (amount < BIGINT_MIN || amount > BIGINT_MAX) {
    throw new BadRequestError('Số tiền giao dịch ví vượt giới hạn lưu trữ');
  }
  return amount;
}

async function findDuplicate(client, entryType, { sessionId, topupId, reservationId, subscriptionId, receiptCode }) {
  if (entryType === 'SESSION_DEBIT' && sessionId != null) {
    return client.query(
      "SELECT id FROM wallet_ledger WHERE entry_type = 'SESSION_DEBIT' AND session_id = $1 LIMIT 1",
      [sessionId]
    );
  }
  if (entryType === 'TOPUP_MANUAL' && receiptCode != null) {
    return client.query(
      "SELECT id FROM wallet_ledger WHERE entry_type = 'TOPUP_MANUAL' AND receipt_code = $1 LIMIT 1",
      [receiptCode]
    );
  }
  if (entryType === 'TOPUP_GATEWAY' && topupId != null) {
    return client.query(
      "SELECT id FROM wallet_ledger WHERE entry_type = 'TOPUP_GATEWAY' AND topup_id = $1 LIMIT 1",
      [topupId]
    );
  }
  if (entryType === 'RESERVATION_FEE' && reservationId != null) {
    return client.query(
      "SELECT id FROM wallet_ledger WHERE entry_type = 'RESERVATION_FEE' AND reservation_id = $1 LIMIT 1",
      [reservationId]
    );
  }
  if (entryType === 'SUBSCRIPTION_FEE' && subscriptionId != null) {
    return client.query(
      "SELECT id FROM wallet_ledger WHERE entry_type = 'SUBSCRIPTION_FEE' AND subscription_id = $1 LIMIT 1",
      [subscriptionId]
    );
  }
  return { rowCount: 0, rows: [] };
}

async function postEntry(client, {
  driverId,
  entryType,
  amountDong,
  sessionId = null,
  topupId = null,
  reservationId = null,
  subscriptionId = null,
  receiptCode = null,
  reason = null,
  createdBy = null,
  periodDate = null,
  allowLocked = false,
} = {}) {
  const amount = validateEntry({ driverId, entryType, amountDong });
  if (entryType === 'SESSION_DEBIT' && sessionId == null) {
    throw new BadRequestError('SESSION_DEBIT phải tham chiếu tới phiên sạc');
  }

  await client.query(
    'INSERT INTO wallets (driver_id) VALUES ($1) ON CONFLICT (driver_id) DO NOTHING',
    [driverId]
  );
  const walletResult = await client.query(
    'SELECT driver_id, balance_dong, locked, locked_reason, locked_at FROM wallets WHERE driver_id = $1 FOR UPDATE',
    [driverId]
  );
  const wallet = walletResult.rows[0];
  if (!wallet) {
    throw new AppError(404, 'WALLET_NOT_FOUND', 'Không tìm thấy hoặc không thể tạo ví tài xế');
  }

  const duplicate = await findDuplicate(client, entryType, {
    sessionId,
    topupId,
    reservationId,
    subscriptionId,
    receiptCode,
  });
  if (duplicate.rowCount) return { duplicated: true };

  if (wallet.locked && !allowLocked && !LOCKED_WALLET_ENTRY_TYPES.has(entryType)) {
    throw new WalletLockedError();
  }

  const nextBalance = BigInt(wallet.balance_dong) + amount;
  if (nextBalance < BIGINT_MIN || nextBalance > BIGINT_MAX) {
    throw new BadRequestError('Số dư ví vượt giới hạn lưu trữ');
  }
  if (nextBalance < 0n && !DEBT_ENTRY_TYPES.has(entryType)) {
    throw new InsufficientBalanceError();
  }

  const entryResult = await client.query(
    `INSERT INTO wallet_ledger (
       driver_id, entry_type, amount_dong, balance_after_dong,
       session_id, topup_id, reservation_id, subscription_id, receipt_code, reason, created_by, period_date
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
       COALESCE($12::date, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
     )
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      driverId,
      entryType,
      amount.toString(),
      nextBalance.toString(),
      sessionId,
      topupId,
      reservationId,
      subscriptionId,
      receiptCode,
      reason,
      createdBy,
      periodDate,
    ]
  );
  if (!entryResult.rows[0]) return { duplicated: true };

  const updatedWallet = await client.query(
    `UPDATE wallets
     SET balance_dong = $2, updated_at = CURRENT_TIMESTAMP
     WHERE driver_id = $1
     RETURNING driver_id, balance_dong, locked, locked_reason, locked_at, updated_at`,
    [driverId, nextBalance.toString()]
  );

  return {
    duplicated: false,
    wallet: updatedWallet.rows[0],
    entry: entryResult.rows[0],
  };
}

module.exports = { postEntry, WalletLockedError, InsufficientBalanceError };
