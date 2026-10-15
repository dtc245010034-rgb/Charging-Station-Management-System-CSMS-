const crypto = require('node:crypto');
const { BadRequestError, NotFoundError } = require('../../lib/errors');
const { getPaymentGateway } = require('../payments/gateway');
const topupRepo = require('./topup.repository');

const MIN_TOPUP_AMOUNT_DONG = 10000;
const MAX_TOPUP_AMOUNT_DONG = 5000000;
const MAX_PENDING_TOPUPS = 5;
const TOPUP_EXPIRY_MINUTES = 30;

function formatTopup(row) {
  return {
    ref: row.order_ref,
    status: row.status,
    amountDong: Number(row.amount_dong),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    failureReason: row.failure_reason,
  };
}

async function createTopup(user, { amountDong }, idempotencyKey) {
  if (!idempotencyKey) {
    throw new BadRequestError('Thiếu header Idempotency-Key');
  }
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new BadRequestError('Idempotency-Key không hợp lệ');
  }

  const amount = Number(amountDong);
  if (!Number.isInteger(amount) || amount < MIN_TOPUP_AMOUNT_DONG || amount > MAX_TOPUP_AMOUNT_DONG) {
    throw new BadRequestError(`Số tiền nạp phải là số nguyên từ ${MIN_TOPUP_AMOUNT_DONG.toLocaleString('vi-VN')} đ đến ${MAX_TOPUP_AMOUNT_DONG.toLocaleString('vi-VN')} đ`);
  }

  // Chống gửi lặp: kiểm tra đơn đã tạo với cùng Idempotency-Key
  const existing = await topupRepo.findByDriverAndIdempotencyKey(user.id, idempotencyKey);
  if (existing) {
    const gateway = getPaymentGateway(existing.gateway);
    const payment = gateway.createPayment({
      orderRef: existing.order_ref,
      amountDong: Number(existing.amount_dong),
    });
    return {
      topup: formatTopup(existing),
      redirectUrl: payment.redirectUrl,
    };
  }

  // Giới hạn tối đa 5 đơn PENDING cùng lúc
  const pendingCount = await topupRepo.countPendingByDriver(user.id);
  if (pendingCount >= MAX_PENDING_TOPUPS) {
    throw new BadRequestError(`Tài xế đã có tối đa ${MAX_PENDING_TOPUPS} giao dịch nạp tiền đang chờ xử lý`);
  }

  const orderRef = `TU-${crypto.randomBytes(8).toString('hex')}`;
  const expiresAt = new Date(Date.now() + TOPUP_EXPIRY_MINUTES * 60 * 1000);

  const created = await topupRepo.createTopup({
    driverId: user.id,
    amountDong: amount,
    orderRef,
    idempotencyKey,
    expiresAt,
    gateway: 'SANDBOX',
  });

  const record = created || await topupRepo.findByDriverAndIdempotencyKey(user.id, idempotencyKey);
  const gateway = getPaymentGateway(record.gateway);
  const payment = gateway.createPayment({
    orderRef: record.order_ref,
    amountDong: Number(record.amount_dong),
  });

  return {
    topup: formatTopup(record),
    redirectUrl: payment.redirectUrl,
  };
}

async function getTopup(user, orderRef) {
  const topup = await topupRepo.findByRef(orderRef);
  if (!topup || String(topup.driver_id) !== String(user.id)) {
    throw new NotFoundError('Không tìm thấy giao dịch nạp tiền');
  }

  return {
    topup: formatTopup(topup),
  };
}

module.exports = {
  createTopup,
  getTopup,
  formatTopup,
  MIN_TOPUP_AMOUNT_DONG,
  MAX_TOPUP_AMOUNT_DONG,
  MAX_PENDING_TOPUPS,
};
