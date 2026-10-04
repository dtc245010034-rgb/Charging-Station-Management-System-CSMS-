const { markAllChargePointsOffline } = require('../charge-points/presence');
const { sanitizeErrorMessage } = require('../../lib/constants');
const { closeWithGrace } = require('../charge-points/connection-registry');

const SHUTDOWN_CLOSE_CODE = 1001;
const SHUTDOWN_CLOSE_REASON = 'Server shutting down';

function createShutdown({ server, wss, pool, log = console.log, logError = console.error, exit = (code) => process.exit(code), waitMs = 5000 }) {
  let running = null;

  async function run(signal) {
    log(`[CSMS] Nhận ${signal}, đang tắt máy...`);
    let exitCode = 0;
    try {
      server.close();
      server.closeIdleConnections?.();

      const closing = [...wss.clients].filter((ws) => ws.readyState !== 3).map((ws) => new Promise((resolve) => {
        ws.once('close', resolve);
        closeWithGrace(ws, SHUTDOWN_CLOSE_CODE, SHUTDOWN_CLOSE_REASON);
      }));
      let timer;
      await Promise.race([Promise.all(closing), new Promise((resolve) => { timer = setTimeout(resolve, waitMs); })]);
      clearTimeout(timer);
      for (const ws of wss.clients) ws.terminate();

      // Tin BootNotification đang xử lý dở có thể ghi ONLINE sau lượt này; khởi động lần sau sẽ dọn nốt.
      const swept = await markAllChargePointsOffline(pool);
      log(`[CSMS] Đã chuyển ${swept.chargePoints} trụ và ${swept.connectors} đầu nối về UNKNOWN`);
      await pool.end();
    } catch (error) {
      exitCode = 1;
      logError('[CSMS] Lỗi khi tắt máy:', sanitizeErrorMessage(error?.message || error));
    }
    exit(exitCode);
  }

  // Tín hiệu lặp lại khi đang tắt được bỏ qua.
  return (signal) => {
    running ??= run(signal);
    return running;
  };
}

module.exports = { createShutdown, SHUTDOWN_CLOSE_CODE };
