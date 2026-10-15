const { pool } = require('../../db/pool');
const { sanitizeErrorMessage } = require('../../lib/constants');

async function expirePendingTopups(db = pool) {
  const result = await db.query(
    `UPDATE wallet_topups
     SET status = 'EXPIRED',
         failure_reason = 'EXPIRED'
     WHERE status = 'PENDING'
       AND expires_at <= CURRENT_TIMESTAMP
     RETURNING id, order_ref, driver_id, amount_dong`
  );
  return {
    expiredCount: result.rowCount,
    expiredTopups: result.rows,
  };
}

function startTopupExpiryJob({
  db = pool,
  intervalMs = 60000,
  logInfo = console.info,
  logError = console.error,
} = {}) {
  let running = null;

  async function run() {
    if (running) return running;
    running = (async () => {
      try {
        const result = await expirePendingTopups(db);
        if (result.expiredCount > 0) {
          logInfo(`[Topup expiry] Đã chuyển ${result.expiredCount} lần nạp PENDING quá hạn sang EXPIRED`);
        }
      } catch (error) {
        logError(`[Topup expiry] Lỗi quét lần nạp hết hạn: ${sanitizeErrorMessage(error?.message || error)}`);
      }
    })().finally(() => { running = null; });
    return running;
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  expirePendingTopups,
  startTopupExpiryJob,
};
