const http = require('node:http');
const { once } = require('node:events');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { WebSocket, WebSocketServer } = require('ws');
const { app, closePool } = require('../helpers/app');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { pool } = require('../../src/db/pool');
const { MAX_WS_PAYLOAD } = require('../../src/lib/constants');
const connections = require('../../src/modules/charge-points/connection-registry');
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createBootNotificationHandler } = require('../../src/modules/ocpp/handlers/boot-notification');
const { startKeepalive, registerOcppConnection } = require('../../src/modules/ocpp/ws-connection');

describe('WS Connection Layer: B3, B8, B9', () => {
  let owner;
  let station;
  let server;
  let wss;
  let wsUrl;
  let keepalive;
  const ocppLogs = [];
  const clients = new Set();

  const PING_INTERVAL_MS = 60;
  const RATE_LIMIT_MAX = 5;

  const post = (url, body) => request(app).post(url).set('Cookie', owner.cookie).send(body);

  async function connectWs(code, protocols = ['ocpp1.6']) {
    const ws = new WebSocket(`${wsUrl}/ocpp/${encodeURIComponent(code)}`, protocols);
    ws.on('error', () => {});
    clients.add(ws);
    await once(ws, 'open');
    return ws;
  }

  function receiveFrame(ws) {
    return new Promise((resolve) => ws.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
  }

  async function closeWs(ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
      await once(ws, 'close');
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
  }

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    owner = await createUser('layer-owner@example.com', 'STATION_OWNER');
    station = (await postStation(owner, stationBody({ name: 'Layer Test Station' }))).body;

    // Tạo các trụ sạc dùng cho test
    await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-B3-TEST' });
    await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-B8-TEST' });
    await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-S13-TEST' });
    await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-B9-PONG' });
    await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-B9-NOPONG' });

    server = http.createServer();
    wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_WS_PAYLOAD,
      handleProtocols: (protocols) => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
    });

    keepalive = startKeepalive(wss, {
      pingIntervalMs: PING_INTERVAL_MS,
      logWarning: (msg) => ocppLogs.push({ level: 'warn', msg }),
    });

    const bootHandler = createBootNotificationHandler({
      pool,
      getHeartbeatInterval: () => 60,
      logInfo: (msg) => ocppLogs.push({ level: 'info', msg }),
      logError: (msg, detail) => ocppLogs.push({ level: 'error', msg: `${msg} ${detail || ''}` }),
    });

    const ocppMessages = createOcppMessageHandler({
      handlers: {
        BootNotification: bootHandler,
        Heartbeat: async () => ({ currentTime: new Date().toISOString() }),
      },
      logInfo: (msg) => ocppLogs.push({ level: 'info', msg }),
      logWarning: (msg) => ocppLogs.push({ level: 'warn', msg }),
      logError: (msg) => ocppLogs.push({ level: 'error', msg }),
    });

    server.on('upgrade', createOcppUpgradeHandler({
      wss,
      lookupChargePoint: async (code) => {
        const res = await pool.query(
          'SELECT cp.id, cp.code, s.status AS station_status FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.code = $1 LIMIT 1',
          [code]
        );
        return res.rows[0] || null;
      },
      logWarning: (msg) => ocppLogs.push({ level: 'warn', msg }),
      logError: (msg) => ocppLogs.push({ level: 'error', msg }),
    }));

    wss.on('connection', (ws, code) => {
      registerOcppConnection(ws, code, {
        connections,
        ocppMessages,
        pool,
        rateLimitMax: RATE_LIMIT_MAX,
        logWarning: (msg) => ocppLogs.push({ level: 'warn', msg }),
        logError: (msg) => ocppLogs.push({ level: 'error', msg }),
      });
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    wsUrl = `ws://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const ws of clients) {
      await closeWs(ws);
    }
    if (keepalive?.stop) keepalive.stop();
    if (wss) await new Promise((resolve) => wss.close(resolve));
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await resetSchema();
    await closePool();
  });

  describe('B8: Ngắt kết nối đưa trụ về offline (UNKNOWN)', () => {
    it('(b) Đóng socket → DB chuyển về UNKNOWN (offline) và dọn registry', async () => {
      const code = 'CP-B8-TEST';
      const ws = await connectWs(code);

      // Đưa trụ lên ONLINE thông qua BootNotification
      const bootPromise = receiveFrame(ws);
      ws.send(JSON.stringify([2, 'b8-boot-1', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]));
      const bootRes = await bootPromise;
      assert.strictEqual(bootRes[2].status, 'Accepted');

      let check = await query('SELECT status FROM charge_points WHERE code = $1', [code]);
      assert.strictEqual(check.rows[0].status, 'ONLINE');
      assert.strictEqual(connections.isConnected(code), true);

      // Đóng kết nối bình thường
      ws.close();
      await once(ws, 'close');

      // Chờ một chút để event close và cập nhật DB hoàn tất
      await new Promise((r) => setTimeout(r, 50));

      check = await query('SELECT status FROM charge_points WHERE code = $1', [code]);
      assert.strictEqual(check.rows[0].status, 'UNKNOWN');
      assert.strictEqual(connections.isConnected(code), false);
    });

    it('(c) Ca kết nối đôi S-13: socket cũ đóng không ghi đè trạng thái ONLINE của kết nối mới', async () => {
      const code = 'CP-S13-TEST';
      const ws1 = await connectWs(code);

      // ws1 gửi BootNotification để ONLINE
      const boot1Promise = receiveFrame(ws1);
      ws1.send(JSON.stringify([2, 's13-boot-1', 'BootNotification', { chargePointVendor: 'V1', chargePointModel: 'M1' }]));
      const boot1Res = await boot1Promise;
      assert.strictEqual(boot1Res[2].status, 'Accepted');

      let check = await query('SELECT status FROM charge_points WHERE code = $1', [code]);
      assert.strictEqual(check.rows[0].status, 'ONLINE');

      // ws2 kết nối cùng mã trụ -> ws1 sẽ bị server đóng với code 1000
      const ws1ClosePromise = once(ws1, 'close');
      const ws2 = await connectWs(code);

      const [ws1CloseCode] = await ws1ClosePromise;
      assert.strictEqual(ws1CloseCode, 1000);

      // ws2 gửi BootNotification
      const boot2Promise = receiveFrame(ws2);
      ws2.send(JSON.stringify([2, 's13-boot-2', 'BootNotification', { chargePointVendor: 'V2', chargePointModel: 'M2' }]));
      const boot2Res = await boot2Promise;
      assert.strictEqual(boot2Res[2].status, 'Accepted');

      // Đợi sự kiện close của ws1 kích hoạt xong
      await new Promise((r) => setTimeout(r, 50));

      // Kiểm tra DB vẫn phải là ONLINE (không bị ws1 ghi đè về UNKNOWN)
      check = await query('SELECT status FROM charge_points WHERE code = $1', [code]);
      assert.strictEqual(check.rows[0].status, 'ONLINE');
      assert.strictEqual(connections.isConnected(code), true);
      assert.strictEqual(connections.getConnection(code).chargePointCode, code);
      assert.strictEqual(connections.getConnection(code).readyState, WebSocket.OPEN);

      // Khi ws2 đóng -> DB mới về UNKNOWN
      await closeWs(ws2);
      await new Promise((r) => setTimeout(r, 50));

      check = await query('SELECT status FROM charge_points WHERE code = $1', [code]);
      assert.strictEqual(check.rows[0].status, 'UNKNOWN');
      assert.strictEqual(connections.isConnected(code), false);
    });
  });

  describe('B3: Giới hạn tần suất tin nhắn (Rate Limiting)', () => {
    it('(e) Luồng bình thường dưới ngưỡng không bị chặn', async () => {
      const code = 'CP-B3-TEST';
      const ws = await connectWs(code);

      // Gửi BootNotification
      const bootPromise = receiveFrame(ws);
      ws.send(JSON.stringify([2, 'b3-normal-boot', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]));
      const bootRes = await bootPromise;
      assert.strictEqual(bootRes[2].status, 'Accepted');

      // Gửi 3 Heartbeat (dưới ngưỡng RATE_LIMIT_MAX = 5)
      for (let i = 1; i <= 3; i++) {
        const hbPromise = receiveFrame(ws);
        ws.send(JSON.stringify([2, `b3-normal-hb-${i}`, 'Heartbeat', {}]));
        const hbRes = await hbPromise;
        assert.strictEqual(hbRes[0], 3); // CALLRESULT
        assert.ok(hbRes[2].currentTime);
      }

      assert.strictEqual(ws.readyState, WebSocket.OPEN);
      await closeWs(ws);
    });

    it('(d) Gửi vượt ngưỡng (<N> tin/giây) → bị đóng kết nối mã 1008 và log đúng 1 dòng', async () => {
      const code = 'CP-B3-TEST';
      const ws = await connectWs(code);

      // Boot trước để hợp lệ
      const bootPromise = receiveFrame(ws);
      ws.send(JSON.stringify([2, 'b3-flood-boot', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]));
      await bootPromise;

      const logsBefore = ocppLogs.length;
      const closePromise = once(ws, 'close');

      // Bơm liên tiếp 10 Heartbeat (ngưỡng RATE_LIMIT_MAX = 5)
      for (let i = 1; i <= 10; i++) {
        ws.send(JSON.stringify([2, `flood-${i}`, 'Heartbeat', {}]));
      }

      const [closeCode, closeReason] = await closePromise;
      assert.strictEqual(closeCode, 1008);
      assert.match(closeReason.toString(), /Rate limit exceeded/i);

      // Kiểm tra log: chỉ có duy nhất 1 log warning về rate limit
      const rateLimitLogs = ocppLogs.slice(logsBefore).filter((l) => l.msg.includes('Rate limit exceeded'));
      assert.strictEqual(rateLimitLogs.length, 1, 'Chỉ được log đúng 1 dòng cảnh báo khi vượt ngưỡng');

      // Kiểm tra DB sau khi bị ngắt bởi rate limit cũng phải về UNKNOWN
      await new Promise((r) => setTimeout(r, 50));
      const check = await query('SELECT status FROM charge_points WHERE code = $1', [code]);
      assert.strictEqual(check.rows[0].status, 'UNKNOWN');
    });
  });

  describe('B9: Ping/Pong Keepalive', () => {
    it('Trụ có trả pong (hoặc client ws chuẩn tự động pong) thì kết nối duy trì bình thường', async () => {
      const code = 'CP-B9-PONG';
      const ws = await connectWs(code);

      // Chờ qua 2 chu kỳ ping (2 * 60ms = 120ms)
      await new Promise((r) => setTimeout(r, PING_INTERVAL_MS * 2.5));

      // Socket vẫn phải OPEN vì ws client mặc định tự động trả lời frame ping bằng pong
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
      assert.strictEqual(connections.isConnected(code), true);

      await closeWs(ws);
    });

    it('(a) Trụ không trả pong bị terminate và bản ghi kết nối bị dọn', async () => {
      const code = 'CP-B9-NOPONG';
      const ws = await connectWs(code);

      // Đưa trụ lên ONLINE
      const bootPromise = receiveFrame(ws);
      ws.send(JSON.stringify([2, 'b9-boot', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]));
      await bootPromise;

      let check = await query('SELECT status FROM charge_points WHERE code = $1', [code]);
      assert.strictEqual(check.rows[0].status, 'ONLINE');

      // Cố tình vô hiệu hóa việc trả lời pong từ client
      // ws._receiver lắng nghe frame ping và tự động gửi pong. Ta ghi đè ws.pong để không gửi pong về server
      ws.pong = () => {};

      // Chờ qua 2 chu kỳ keepalive:
      // Chu kỳ 1 (60ms): server gửi ping và set ws.isAlive = false
      // Chu kỳ 2 (120ms): server thấy ws.isAlive vẫn là false -> terminate() socket!
      const closePromise = once(ws, 'close');

      await new Promise((r) => setTimeout(r, PING_INTERVAL_MS * 2.5));
      await closePromise;

      assert.strictEqual(ws.readyState, WebSocket.CLOSED);
      assert.strictEqual(connections.isConnected(code), false);

      // B8: Do terminate socket kích hoạt event close, DB cũng phải chuyển về UNKNOWN
      await new Promise((r) => setTimeout(r, 50));
      check = await query('SELECT status FROM charge_points WHERE code = $1', [code]);
      assert.strictEqual(check.rows[0].status, 'UNKNOWN');
    });
  });
});
