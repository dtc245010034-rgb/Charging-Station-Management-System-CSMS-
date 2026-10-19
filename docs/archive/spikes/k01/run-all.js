// Chạy toàn bộ kịch bản K-01 và ghi kết quả vào session-log.json + findings.json.
// Chạy: cd docs/spikes/k01 && npm install && node run-all.js
const fs = require('node:fs');
const path = require('node:path');
const WebSocket = require('ws');
const { createServer } = require('./reference-server');
const { VirtualChargePoint, sleep } = require('./virtual-charge-point');
const { log, mark } = require('./frame-log');

const PORT = 3990;
const findings = {};
const base = `ws://127.0.0.1:${PORT}/ocpp`;

async function rawConnect(identity, protocol) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${base}/${identity}`, protocol);
    ws.on('open', () => resolve({ ws, opened: true }));
    ws.on('unexpected-response', (req, res) => resolve({ opened: false, status: res.statusCode }));
    ws.on('error', (e) => resolve({ opened: false, error: e.message }));
  });
}

(async () => {
  const csms = createServer({ registered: new Set(['K01-SIM-01', 'K01-SIM-02', 'K01-SIM-03']) });
  await csms.listen(PORT);

  // ---- A. Phiên sạc trọn vẹn + B. R-08 SetChargingProfile
  mark('A: phiên sạc trọn vẹn (Boot → Heartbeat → Status → Authorize → Start → Meter → Stop)');
  const cp = new VirtualChargePoint({ endpoint: base, identity: 'K01-SIM-01', maxKw: 22 });
  await cp.connect();
  findings.boot = await cp.boot();
  await cp.call('Heartbeat', {});
  await cp.status(1, 'Available');
  findings.start = await cp.startCharging();
  await cp.sendMeter(); await cp.sendMeter();
  mark('B (R-08): CSMS gửi SetChargingProfile giới hạn 7 kW giữa phiên');
  const beforeKw = cp.limitKw;
  findings.setChargingProfile = await csms.call('K01-SIM-01', 'SetChargingProfile', {
    connectorId: 1,
    csChargingProfiles: { chargingProfileId: 1, stackLevel: 0, chargingProfilePurpose: 'TxProfile', transactionId: cp.transactionId, chargingProfileKind: 'Absolute',
      chargingSchedule: { chargingRateUnit: 'W', chargingSchedulePeriod: [{ startPeriod: 0, limit: 7000 }] } },
  });
  await cp.sendMeter(); await cp.sendMeter();
  const tx = [...csms.transactions.values()][0];
  const powers = tx.meter.map((m) => Number(m[0].sampledValue.find((s) => s.measurand === 'Power.Active.Import').value));
  findings.r08 = { limitBeforeKw: beforeKw, limitAfterKw: cp.limitKw, powersW: powers, respected: powers.slice(-2).every((p) => p <= 7000) };
  findings.stop = await cp.stopCharging();
  findings.totalWh = cp.meterWh - 0;

  // ---- C. Reset từ xa
  mark('C: CSMS gửi Reset(Soft)');
  findings.reset = await csms.call('K01-SIM-01', 'Reset', { type: 'Soft' });

  // ---- D. Rớt kết nối giữa phiên rồi nối lại
  mark('D: rớt kết nối giữa phiên (S-21)');
  const cp2 = new VirtualChargePoint({ endpoint: base, identity: 'K01-SIM-02' });
  await cp2.connect(); await cp2.boot(); await cp2.status(1, 'Available');
  await cp2.startCharging(); await cp2.sendMeter();
  const midTx = cp2.transactionId;
  const reconnected = new Promise((resolve) => cp2.client.once('open', resolve));
  cp2.client._ws.terminate(); // giả lập rớt mạng đột ngột (không có close frame)
  await sleep(100);
  await reconnected; // thư viện tự nối lại
  findings.reconnect = { sameTransactionId: cp2.transactionId === midTx, clientStateAfter: cp2.client.state };
  // Cách trụ thật thường xử lý sau khi nối lại (theo đặc tả, KHÔNG phải do thư viện tự làm): báo lại trạng thái, gửi tiếp số đo.
  await cp2.status(1, 'Charging'); await cp2.sendMeter();
  findings.reconnect.serverStillKnowsTx = csms.transactions.has(midTx);
  findings.reconnect.metersAfter = csms.transactions.get(midTx).meter.length;
  await cp2.stopCharging();

  // ---- E. Từ chối trụ lạ / subprotocol sai / payload sai chuẩn
  mark('E: kiểm tra từ chối');
  findings.unknownIdentity = await rawConnect('KHONG-TON-TAI', 'ocpp1.6');
  findings.wrongSubprotocol = await rawConnect('K01-SIM-03', 'ocpp2.0.1');
  const noProto = await rawConnect('K01-SIM-03', undefined);
  findings.noSubprotocol = { opened: noProto.opened, status: noProto.status };
  noProto.ws?.close();
  const cp3 = new VirtualChargePoint({ endpoint: base, identity: 'K01-SIM-03' });
  await cp3.connect(); await cp3.boot();
  try { await cp3.client.call('StatusNotification', { connectorId: 1, status: 'Charging' }); findings.invalidPayload = 'không bị chặn'; }
  catch (e) { findings.invalidPayload = { side: 'chặn ngay ở phía trụ (strictMode)', error: e.rpcErrorCode ?? e.name, message: e.message.slice(0, 120) }; }

  // Ép gửi khung sai chuẩn thô từ trụ để xem máy chủ trả gì (bỏ qua strict ở phía gửi).
  const raw = await rawConnect('K01-SIM-03', 'ocpp1.6');
  findings.rawInvalidToServer = await new Promise((resolve) => {
    raw.ws.on('message', (data) => resolve(JSON.parse(String(data))));
    raw.ws.send(JSON.stringify([2, 'bad-1', 'StatusNotification', { connectorId: 1, status: 'Charging' }])); // thiếu errorCode
  });
  findings.connectionSurvivesInvalidFrame = await new Promise((resolve) => {
    raw.ws.once('message', (data) => resolve(JSON.parse(String(data))[0] === 3));
    raw.ws.send(JSON.stringify([2, 'ok-2', 'Heartbeat', {}]));
  });
  raw.ws.close();

  // ---- F. Tin nhắn trùng mã (S-14)
  mark('F: cùng messageId gửi hai lần (S-14)');
  const dup = await rawConnect('K01-SIM-03', 'ocpp1.6');
  const replies = [];
  dup.ws.on('message', (d) => replies.push(JSON.parse(String(d))));
  const frame = JSON.stringify([2, 'dup-1', 'StartTransaction', { connectorId: 1, idTag: 'DEMO-TAG-001', meterStart: 0, timestamp: new Date().toISOString() }]);
  dup.ws.send(frame); await sleep(150); dup.ws.send(frame); await sleep(300);
  dup.ws.close();
  findings.duplicateMessageId = { replies, distinctTransactionIds: [...new Set(replies.map((r) => r[2]?.transactionId))].length };

  findings.rejectedByServer = csms.rejected;
  await cp.close(); await cp2.close(); await cp3.close();
  await csms.close();

  fs.writeFileSync(path.join(__dirname, 'session-log.json'), JSON.stringify(log, null, 2));
  fs.writeFileSync(path.join(__dirname, 'findings.json'), JSON.stringify(findings, null, 2));
  console.log(JSON.stringify(findings, null, 2));
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
