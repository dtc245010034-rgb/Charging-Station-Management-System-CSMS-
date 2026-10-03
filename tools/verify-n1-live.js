/**
 * LƯU Ý: Script này chỉ dùng cho môi trường dev cục bộ (local development).
 * Không chạy trên môi trường staging hoặc production.
 *
 * Script tái hiện và xác minh lỗi N1:
 * - Khi handler gặp lỗi Postgres nội bộ (chứa code "42P01", password=..., host=...)
 * - Trước fix: Client nhận đúng code "42P01" và message chứa thông tin nhạy cảm.
 * - Sau fix: Client chỉ nhận mã 'InternalError' và mô tả chung cố định 'Internal error'.
 */
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket, WebSocketServer } = require('ws');
const { createOcppMessageHandler, OcppCallError } = require('../backend/src/modules/ocpp/message-handler');
const { createOcppUpgradeHandler } = require('../backend/src/modules/ocpp/ocpp-upgrade');
async function main() {
  console.log('=== KIỂM THỬ XÁC MINH SỬA LỖI N1 (BẢO MẬT OCPP CALLERROR) ===\n');

  const server = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  const serverLogs = [];

  const ocppMessages = createOcppMessageHandler({
    handlers: {
      TriggerPgError: async () => {
        const error = new Error('relation "users" does not exist; password=supersecret host=10.0.0.1:5432');
        error.code = '42P01';
        throw error;
      },
      TriggerOcppCallError: async () => {
        throw new OcppCallError('PropertyConstraintViolation', 'Field vendor exceeds maximum length of 20 characters', { field: 'vendor' });
      },
      TriggerTypeError: async () => {
        throw new TypeError('Cannot read properties of undefined');
      },
    },
    logInfo: (msg) => serverLogs.push(msg),
    logWarning: (msg) => serverLogs.push(msg),
    logError: (msg) => serverLogs.push(msg),
  });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => { void ocppMessages.handleMessage(ws, raw); });
  });

  server.on('upgrade', createOcppUpgradeHandler({
    wss,
    lookupChargePoint: async (code) => code === 'CP-N1-TEST' ? { id: 1, code, station_status: 'ACTIVE' } : null,
  }));

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ocpp/CP-N1-TEST`, ['ocpp1.6']);
  await once(ws, 'open');

  function receiveFrame() {
    return new Promise((resolve) => ws.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
  }

  // Ca 1: Handler ném lỗi Postgres chứa thông tin nội bộ và password
  console.log('[Ca 1] Handler ném lỗi Postgres (code="42P01", message có "password=supersecret host=10.0.0.1:5432"):');
  const p1 = receiveFrame();
  ws.send(JSON.stringify([2, 'msg-pg-1', 'TriggerPgError', {}]));
  const res1 = await p1;

  console.log('  -> Khung CALLERROR nhận được:', JSON.stringify(res1));
  const raw1 = JSON.stringify(res1);
  const leaked = raw1.includes('password') || raw1.includes('host') || raw1.includes('42P01') || raw1.includes('relation');
  console.log('  -> Rò rỉ thông tin nội bộ / password:', leaked ? 'CÓ (LỖI N1)' : 'KHÔNG (ĐÃ KHẮC PHỤC)');
  console.log('  -> Mã lỗi:', res1[2], '(Kỳ vọng: InternalError)');
  console.log('  -> Mô tả:', res1[3], '(Kỳ vọng: Internal error)');
  if (res1[2] !== 'InternalError' || res1[3] !== 'Internal error' || leaked) {
    throw new Error('Ca 1 thất bại!');
  }

  // Ca 2: Handler chủ động ném OcppCallError
  console.log('\n[Ca 2] Handler ném OcppCallError chuẩn:');
  const p2 = receiveFrame();
  ws.send(JSON.stringify([2, 'msg-ocpp-2', 'TriggerOcppCallError', {}]));
  const res2 = await p2;
  console.log('  -> Khung CALLERROR nhận được:', JSON.stringify(res2));
  console.log('  -> Giữ nguyên code và message:', res2[2] === 'PropertyConstraintViolation' && res2[3].includes('vendor'));
  if (res2[2] !== 'PropertyConstraintViolation') throw new Error('Ca 2 thất bại!');

  // Ca 3: Lỗi TypeError bất kỳ
  console.log('\n[Ca 3] Handler ném TypeError thông thường:');
  const p3 = receiveFrame();
  ws.send(JSON.stringify([2, 'msg-type-3', 'TriggerTypeError', {}]));
  const res3 = await p3;
  console.log('  -> Khung CALLERROR nhận được:', JSON.stringify(res3));
  console.log('  -> Trả về InternalError an toàn:', res3[2] === 'InternalError' && res3[3] === 'Internal error');
  if (res3[2] !== 'InternalError' || res3[3] !== 'Internal error') throw new Error('Ca 3 thất bại!');

  // Kiểm tra Log phía server
  console.log('\n[Kiểm tra Log server]:');
  const hasRawPass = serverLogs.some((l) => l.includes('password=supersecret'));
  const hasSanitizedPass = serverLogs.some((l) => l.includes('password=***'));
  console.log('  -> Log chứa password thô:', hasRawPass);
  console.log('  -> Log đã được làm sạch (password=***):', hasSanitizedPass);
  if (hasRawPass || !hasSanitizedPass) throw new Error('Log sanitization thất bại!');

  ws.close();
  await once(ws, 'close');
  server.close();
  console.log('\n=== TẤT CẢ CÁC CA XÁC MINH N1 ĐỀU THÀNH CÔNG ===');
}

main().catch((err) => {
  console.error('Lỗi khi chạy script xác minh:', err);
  process.exit(1);
});
