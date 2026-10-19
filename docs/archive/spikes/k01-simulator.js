// Spike K-01: trụ sạc ảo tối giản dùng thư viện `ws` đã có sẵn trong backend (không thêm phụ thuộc).
// Dùng một lần để lấy bản ghi chuỗi tin nhắn thật cho docs/spikes/K-01-ocpp-simulator.md — không phải code sản phẩm.
// Chạy: node docs/spikes/k01-simulator.js <ws-url> <log-file>
const WebSocket = require('ws');
const fs = require('node:fs');

const [, , wsUrl, logFile] = process.argv;
const log = [];
const record = (direction, raw) => {
  const entry = { t: new Date().toISOString(), direction, message: JSON.parse(raw) };
  log.push(entry);
  console.log(direction, JSON.stringify(entry.message));
};

const send = (ws, frame) => { const raw = JSON.stringify(frame); record('> gửi', raw); ws.send(raw); };
const nextId = (() => { let n = 0; return () => `sim-${++n}`; })();

const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  send(ws, [2, nextId(), 'BootNotification', { chargePointVendor: 'SpikeSim', chargePointModel: 'K-01-Virtual' }]);
});

let step = 0;
ws.on('message', (raw) => {
  record('< nhận', raw.toString());
  step += 1;
  // Gửi lần lượt các bản tin sau khi nhận phản hồi/welcome trước đó.
  if (step === 1) send(ws, [2, nextId(), 'Heartbeat', {}]);
  else if (step === 2) send(ws, [2, nextId(), 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' }]);
  else if (step === 3) send(ws, [2, nextId(), 'Authorize', { idTag: 'DEMO-TAG-001' }]);
  // Thử vượt phạm vi hiện tại: server chưa hỗ trợ StartTransaction (thuộc Sprint 3).
  else if (step === 4) send(ws, [2, nextId(), 'StartTransaction', { connectorId: 1, idTag: 'DEMO-TAG-001', meterStart: 0, timestamp: new Date().toISOString() }]);
  else if (step === 5) return; // chờ phản hồi của StartTransaction (bước 6) trước khi ghi file
  else if (step === 6) {
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    ws.close();
  }
});

ws.on('error', (error) => { console.error('WS error:', error.message); process.exitCode = 1; });
ws.on('close', () => { console.log(`Đã lưu bản ghi vào ${logFile}`); });
