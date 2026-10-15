const env = require('../../config/env');
const { secureRouter } = require('../../security/routeGuard');
const topupRepo = require('../wallet/topup.repository');
const { computeSignature } = require('./hmac');

const router = secureRouter();
const PUBLIC = { access: 'public' };

async function dispatchWebhook({ payload, signatureOverride }) {
  const rawBody = JSON.stringify(payload);
  const secret = env.PAYMENT_WEBHOOK_SECRET || 'test-secret-0123456789abcdef0123456789abcd';
  const signature = signatureOverride || computeSignature(secret, rawBody);
  const baseUrl = env.INTERNAL_BASE_URL || `http://127.0.0.1:${env.PORT || 3000}`;

  try {
    const res = await fetch(`${baseUrl}/api/webhooks/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': signature,
      },
      body: rawBody,
    });
    return res.status;
  } catch (error) {
    console.error('[SandboxGateway] Lỗi gọi webhook HTTP:', error.message);
    return null;
  }
}

router.get('/pay', PUBLIC, async (req, res) => {
  if (env.SANDBOX_GATEWAY !== 1) {
    return res.status(404).send('Not Found');
  }

  const orderRef = req.query.order;
  if (!orderRef) {
    return res.status(400).send('Thiếu tham số order (?order=TU-...)');
  }

  const topup = await topupRepo.findByRef(orderRef);
  if (!topup) {
    return res.status(404).send('Không tìm thấy giao dịch nạp tiền');
  }

  const amountFormatted = Number(topup.amount_dong).toLocaleString('vi-VN');

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cổng Thanh Toán Sandbox — CSMS</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f4f5f7; margin: 0; padding: 24px; color: #172b4d; }
    .card { max-width: 540px; margin: 40px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
    h1 { font-size: 20px; margin-top: 0; color: #0052cc; display: flex; align-items: center; gap: 8px; }
    .badge { background: #deebff; color: #0747a6; font-size: 12px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .info { background: #fafbfc; border: 1px solid #ebecf0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .info-row:last-child { margin-bottom: 0; }
    .amount { font-size: 24px; font-weight: 700; color: #00875a; }
    .btn-group { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
    button { padding: 12px 16px; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; transition: 0.15s ease; text-align: center; }
    .btn-success { background: #00875a; color: #fff; }
    .btn-success:hover { background: #006644; }
    .btn-danger { background: #de350b; color: #fff; }
    .btn-danger:hover { background: #bf2600; }
    .btn-secondary { background: #f4f5f7; color: #172b4d; border: 1px solid #dfe1e6; }
    .btn-secondary:hover { background: #ebecf0; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #6b778c; margin-top: 16px; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Cổng Thanh Toán Giả Lập <span class="badge">SANDBOX</span></h1>
    <div class="info">
      <div class="info-row"><span>Mã giao dịch:</span><strong>${topup.order_ref}</strong></div>
      <div class="info-row"><span>Trạng thái:</span><span>${topup.status}</span></div>
      <div class="info-row" style="margin-top: 12px; align-items: baseline;">
        <span>Số tiền:</span>
        <span class="amount">${amountFormatted} đ</span>
      </div>
    </div>

    <form method="POST" action="/sandbox-gateway/action">
      <input type="hidden" name="orderRef" value="${topup.order_ref}">

      <div class="section-title">Kịch bản cơ bản</div>
      <div class="btn-group">
        <button type="submit" name="action" value="success" class="btn-success">Thanh toán thành công</button>
        <button type="submit" name="action" value="failed" class="btn-danger">Thất bại</button>
        <button type="submit" name="action" value="cancelled" class="btn-secondary">Huỷ</button>
      </div>

      <div class="section-title">Kịch bản kiểm thử nâng cao</div>
      <div class="btn-group">
        <button type="submit" name="action" value="delayed_webhook" class="btn-secondary">Quay về ngay, gửi webhook sau 10 giây</button>
        <button type="submit" name="action" value="repeat_5_times" class="btn-secondary">Gửi webhook 5 lần</button>
        <button type="submit" name="action" value="wrong_amount" class="btn-secondary">Gửi webhook sai số tiền</button>
        <button type="submit" name="action" value="bad_signature" class="btn-secondary">Gửi webhook sai chữ ký</button>
      </div>
    </form>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

router.post('/action', PUBLIC, async (req, res) => {
  if (env.SANDBOX_GATEWAY !== 1) {
    return res.status(404).send('Not Found');
  }

  const orderRef = req.body?.orderRef || req.query?.orderRef;
  const action = req.body?.action || req.query?.action;

  if (!orderRef || !action) {
    return res.status(400).send('Thiếu orderRef hoặc action');
  }

  const topup = await topupRepo.findByRef(orderRef);
  if (!topup) {
    return res.status(404).send('Không tìm thấy giao dịch nạp tiền');
  }

  const redirectUrl = `/app.html#/driver/wallet?topup=${encodeURIComponent(orderRef)}`;

  if (action === 'success') {
    const payload = {
      orderRef: topup.order_ref,
      gatewayTxnId: `GW-${Date.now()}`,
      status: 'SUCCESS',
      amountDong: Number(topup.amount_dong),
    };
    await dispatchWebhook({ payload });
    return res.redirect(redirectUrl);
  }

  if (action === 'failed') {
    const payload = {
      orderRef: topup.order_ref,
      gatewayTxnId: `GW-${Date.now()}`,
      status: 'FAILED',
      amountDong: Number(topup.amount_dong),
      reason: 'USER_FAILED',
    };
    await dispatchWebhook({ payload });
    return res.redirect(redirectUrl);
  }

  if (action === 'cancelled') {
    const payload = {
      orderRef: topup.order_ref,
      gatewayTxnId: `GW-${Date.now()}`,
      status: 'CANCELLED',
      amountDong: Number(topup.amount_dong),
      reason: 'USER_CANCELLED',
    };
    await dispatchWebhook({ payload });
    return res.redirect(redirectUrl);
  }

  if (action === 'delayed_webhook') {
    const payload = {
      orderRef: topup.order_ref,
      gatewayTxnId: `GW-${Date.now()}`,
      status: 'SUCCESS',
      amountDong: Number(topup.amount_dong),
    };
    setTimeout(() => {
      dispatchWebhook({ payload });
    }, 10000);
    return res.redirect(redirectUrl);
  }

  if (action === 'repeat_5_times') {
    const gatewayTxnId = `GW-${Date.now()}`;
    const payload = {
      orderRef: topup.order_ref,
      gatewayTxnId,
      status: 'SUCCESS',
      amountDong: Number(topup.amount_dong),
    };
    for (let i = 0; i < 5; i++) {
      await dispatchWebhook({ payload });
    }
    return res.redirect(redirectUrl);
  }

  if (action === 'wrong_amount') {
    const payload = {
      orderRef: topup.order_ref,
      gatewayTxnId: `GW-${Date.now()}`,
      status: 'SUCCESS',
      amountDong: Math.max(1, Number(topup.amount_dong) - 1000),
    };
    await dispatchWebhook({ payload });
    return res.redirect(redirectUrl);
  }

  if (action === 'bad_signature') {
    const payload = {
      orderRef: topup.order_ref,
      gatewayTxnId: `GW-${Date.now()}`,
      status: 'SUCCESS',
      amountDong: Number(topup.amount_dong),
    };
    await dispatchWebhook({
      payload,
      signatureOverride: '0000000000000000000000000000000000000000000000000000000000000000',
    });
    return res.redirect(redirectUrl);
  }

  return res.status(400).send('Hành động không hợp lệ');
});

module.exports = router;
