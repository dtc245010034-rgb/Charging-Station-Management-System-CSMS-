// POST /api/webhooks/payment — webhook từ cổng thanh toán sandbox
// Raw body được đọc trực tiếp (express.raw) để kiểm chữ ký HMAC-SHA256.
// Route này phải được mount TRƯỚC express.json() trong app.js.
const { secureRouter } = require('../../security/routeGuard');
const express = require('express');
const { pool } = require('../../db/pool');
const { verifySignature } = require('./hmac');
const { findByRef, updateTopupStatus } = require('../wallet/topup.repository');
const { postEntry } = require('../wallet/ledger.service');
const { ghi_nhat_ky } = require('../audit/audit.repository');
const env = require('../../config/env');

const router = secureRouter();

// Rate-limiter đơn giản theo IP dùng bộ nhớ trong (1 tiến trình).
// Giới hạn: tối đa 30 webhook/phút từ cùng một IP.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ipCounters = new Map(); // ip → { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = ipCounters.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    ipCounters.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX;
}

// Dọn bộ nhớ mỗi 5 phút để tránh rò rỉ.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounters) {
    if (now >= entry.resetAt) ipCounters.delete(ip);
  }
}, 300_000).unref();

// Middleware lấy raw body — phải đặt TRƯỚC express.json() trong app.js.
const rawJsonBody = express.raw({ type: 'application/json', limit: '16kb' });

router.post('/payment', { access: 'public' }, rawJsonBody, async (req, res, next) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  // --- Rate limit theo IP ---
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Quá nhiều webhook từ IP này' } });
  }

  // --- Kiểm chữ ký HMAC ---
  const secret = env.PAYMENT_WEBHOOK_SECRET;
  const signature = req.headers['x-signature'];
  const rawBody = req.body; // Buffer từ express.raw

  if (!secret || !Buffer.isBuffer(rawBody) || rawBody.length === 0
      || !verifySignature(secret, rawBody, signature)) {
    // Ghi audit nhưng KHÔNG ghi thân hoặc chữ ký gốc (tránh lộ thông tin nhạy cảm)
    ghi_nhat_ky(
      null, 'WEBHOOK_BAD_SIGNATURE', 'webhook', null,
      { ip, reason: 'Chữ ký webhook không hợp lệ hoặc thiếu' },
      'FAIL', ip
    ).catch(() => {});
    return res.status(401).json({ error: { code: 'BAD_SIGNATURE', message: 'Chữ ký webhook không hợp lệ' } });
  }

  // --- Parse JSON (đã có raw body hợp lệ) ---
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Thân webhook không phải JSON hợp lệ' } });
  }

  const { orderRef, gatewayTxnId, status, amountDong } = payload;

  // --- Validate trường bắt buộc ---
  if (!orderRef || typeof orderRef !== 'string'
      || !gatewayTxnId || typeof gatewayTxnId !== 'string'
      || !['SUCCESS', 'FAILED', 'CANCELLED'].includes(status)
      || typeof amountDong !== 'number' || !Number.isInteger(amountDong) || amountDong <= 0) {
    return res.status(400).json({ error: { code: 'INVALID_PAYLOAD', message: 'Tham số webhook không hợp lệ' } });
  }

  // --- Tìm đơn nạp ---
  const topup = await findByRef(orderRef).catch((err) => { next(err); return undefined; });
  if (topup === undefined) return; // lỗi đã chuyển sang next()
  if (!topup) {
    console.warn(`[webhook] orderRef không tồn tại: ${orderRef} ip=${ip}`);
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy đơn nạp' } });
  }

  // --- Kiểm số tiền ---
  if (amountDong !== Number(topup.amount_dong)) {
    ghi_nhat_ky(
      null, 'WEBHOOK_AMOUNT_MISMATCH', 'wallet_topups', String(topup.id),
      { orderRef, expected: Number(topup.amount_dong), received: amountDong, ip },
      'FAIL', ip
    ).catch(() => {});
    return res.status(422).json({ error: { code: 'AMOUNT_MISMATCH', message: 'Số tiền webhook không khớp đơn nạp' } });
  }

  // --- Kiểm idempotency: cùng gatewayTxnId đã SUCCESS → trả duplicate ---
  if (topup.status === 'SUCCESS' && topup.gateway_txn_id === gatewayTxnId) {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  // --- SUCCESS tới sau FAILED/CANCELLED → 409 ---
  if (status === 'SUCCESS' && ['FAILED', 'CANCELLED'].includes(topup.status)) {
    return res.status(409).json({ error: { code: 'TERMINAL_STATE', message: 'Đơn nạp đã ở trạng thái cuối, không thể cập nhật thành SUCCESS' } });
  }

  // --- Đã SUCCESS bởi gatewayTxnId khác → idempotency đã bao phủ ở trên; nếu cùng SUCCESS và khác txnId vẫn 200 nhưng không cộng lại ---
  if (topup.status === 'SUCCESS') {
    return res.status(200).json({ ok: true, duplicate: true });
  }

  // --- Xử lý trong 1 transaction ---
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (status === 'SUCCESS') {
      const updated = await updateTopupStatus({
        orderRef,
        newStatus: 'SUCCESS',
        gatewayTxnId,
        allowedCurrentStatuses: ['PENDING', 'EXPIRED'],
      }, client);

      if (!updated) {
        // Race: đơn đã được cập nhật bởi request song song
        await client.query('ROLLBACK');
        return res.status(200).json({ ok: true, duplicate: true });
      }

      // Cộng ví
      await postEntry(client, {
        driverId: updated.driver_id,
        entryType: 'TOPUP_GATEWAY',
        amountDong: BigInt(updated.amount_dong),
        topupId: updated.id,
        allowLocked: true,
      });

      // Ghi audit
      await ghi_nhat_ky(
        updated.driver_id,
        'WALLET_TOPUP_GATEWAY',
        'wallet_topups',
        String(updated.id),
        { orderRef, gatewayTxnId, amountDong: Number(updated.amount_dong), ip },
        'OK',
        ip,
        client
      );

    } else {
      // FAILED hoặc CANCELLED
      const updated = await updateTopupStatus({
        orderRef,
        newStatus: status,
        gatewayTxnId,
        failureReason: status,
        allowedCurrentStatuses: ['PENDING', 'EXPIRED'],
      }, client);

      if (!updated) {
        await client.query('ROLLBACK');
        return res.status(200).json({ ok: true, duplicate: true });
      }
    }

    await client.query('COMMIT');
    return res.status(200).json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
