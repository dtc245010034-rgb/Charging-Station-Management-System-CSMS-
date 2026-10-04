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
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createBootNotificationHandler } = require('../../src/modules/ocpp/handlers/boot-notification');

describe('WS Hardening: B1, B2, B4, B7', () => {
  let owner;
  let station;
  let server;
  let wss;
  let wsUrl;
  const ocppLogs = [];
  const clients = new Set();
  let failUpdate = false;

  const post = (url, body) => request(app).post(url).set('Cookie', owner.cookie).send(body);
  const patch = (url, body) => request(app).patch(url).set('Cookie', owner.cookie).send(body);
  const get = (url) => request(app).get(url).set('Cookie', owner.cookie);

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

    owner = await createUser('hardening-owner@example.com', 'STATION_OWNER');
    station = (await postStation(owner, stationBody({ name: 'Hardening Station' }))).body;

    server = http.createServer();
    wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_WS_PAYLOAD,
      handleProtocols: (protocols) => protocols.has('ocpp1.6') ? 'ocpp1.6' : false,
    });

    const mockPool = {
      query: async (sql, params) => {
        if (failUpdate && sql.includes('UPDATE charge_points')) {
          throw new Error('Simulated DB UPDATE error');
        }
        return pool.query(sql, params);
      },
    };

    const bootHandler = createBootNotificationHandler({
      pool: mockPool,
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
      ws.chargePointCode = code;
      ws.on('error', () => {});
      ws.on('message', (raw) => { void ocppMessages.handleMessage(ws, raw); });
      ws.on('close', () => { ocppMessages.closeConnection(ws); });
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    wsUrl = `ws://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const ws of clients) {
      await closeWs(ws);
    }
    if (wss) await new Promise((resolve) => wss.close(resolve));
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await resetSchema();
    await closePool();
  });

  describe('B1: Mã trụ đồng nhất giữa API và Handshake', () => {
    it('API từ chối tạo trụ với mã chứa ký tự không hợp lệ (trả 400 Bad Request)', async () => {
      const invalidCodes = ['CP.01', 'CP 02', 'cp/04', 'CP@01', 'CP!01', ''];
      for (const badCode of invalidCodes) {
        const res = await post(`/api/stations/${station.id}/charge-points`, { code: badCode });
        assert.strictEqual(res.status, 400, `Mã ${JSON.stringify(badCode)} phải bị trả 400`);
        assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
      }
    });

    it('API từ chối cập nhật mã trụ thành mã không hợp lệ (trả 400)', async () => {
      const created = await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-B1-VALID' });
      assert.strictEqual(created.status, 201);

      const res = await patch(`/api/charge-points/${created.body.id}`, { code: 'CP.INVALID.NEW' });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('API check-code từ chối mã không hợp lệ với mã lỗi 400', async () => {
      const res = await get('/api/charge-points/check-code?code=CP.01');
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error.code, 'BAD_REQUEST');
    });

    it('Mã hợp lệ tạo được qua API và kết nối WebSocket thành công', async () => {
      const created = await post(`/api/stations/${station.id}/charge-points`, { code: 'cp-ok-b1' });
      assert.strictEqual(created.status, 201);
      assert.strictEqual(created.body.code, 'CP-OK-B1');

      // Kết nối WebSocket bằng mã vừa tạo
      const ws = await connectWs('CP-OK-B1');
      assert.strictEqual(ws.readyState, WebSocket.OPEN);
      await closeWs(ws);
    });
  });

  describe('B2: Giới hạn kích thước khung & độ dài các trường BootNotification', () => {
    it('Khung vượt quá maxPayload (64 KB) bị đóng kết nối', async () => {
      const ws = await connectWs('CP-OK-B1');
      const closePromise = once(ws, 'close');

      // Gửi payload > 64 KB (ví dụ 70 KB)
      const oversizedPayload = 'X'.repeat(70 * 1024);
      ws.send(JSON.stringify([2, 'msg-oversized', 'Heartbeat', { extra: oversizedPayload }]));

      const [closeCode] = await closePromise;
      // Mã đóng chuẩn của ws khi vượt maxPayload là 1009 (Message Too Big)
      assert.strictEqual(closeCode, 1009);
    });

    it('BootNotification với vendor vượt 20 ký tự bị từ chối bằng PropertyConstraintViolation và không ghi DB', async () => {
      const ws = await connectWs('CP-OK-B1');
      const resPromise = receiveFrame(ws);

      ws.send(JSON.stringify([
        2,
        'msg-vendor-toolong',
        'BootNotification',
        {
          chargePointVendor: 'V'.repeat(21),
          chargePointModel: 'ValidModel',
        },
      ]));

      const res = await resPromise;
      assert.strictEqual(res[0], 4); // CALLERROR
      assert.strictEqual(res[1], 'msg-vendor-toolong');
      assert.strictEqual(res[2], 'PropertyConstraintViolation');

      // Kiểm tra DB không bị thay đổi (status vẫn UNKNOWN, vendor vẫn NULL)
      const dbCheck = await query("SELECT status, vendor FROM charge_points WHERE code = 'CP-OK-B1'");
      assert.strictEqual(dbCheck.rows[0].status, 'UNKNOWN');
      assert.strictEqual(dbCheck.rows[0].vendor, null);

      await closeWs(ws);
    });

    it('BootNotification với model vượt 20 ký tự bị từ chối bằng PropertyConstraintViolation', async () => {
      const ws = await connectWs('CP-OK-B1');
      const resPromise = receiveFrame(ws);

      ws.send(JSON.stringify([
        2,
        'msg-model-toolong',
        'BootNotification',
        {
          chargePointVendor: 'ValidVendor',
          chargePointModel: 'M'.repeat(21),
        },
      ]));

      const res = await resPromise;
      assert.strictEqual(res[0], 4);
      assert.strictEqual(res[2], 'PropertyConstraintViolation');
      await closeWs(ws);
    });

    it('BootNotification với firmwareVersion vượt 50 ký tự bị từ chối bằng PropertyConstraintViolation', async () => {
      const ws = await connectWs('CP-OK-B1');
      const resPromise = receiveFrame(ws);

      ws.send(JSON.stringify([
        2,
        'msg-fw-toolong',
        'BootNotification',
        {
          chargePointVendor: 'ValidVendor',
          chargePointModel: 'ValidModel',
          firmwareVersion: 'F'.repeat(51),
        },
      ]));

      const res = await resPromise;
      assert.strictEqual(res[0], 4);
      assert.strictEqual(res[2], 'PropertyConstraintViolation');
      await closeWs(ws);
    });
  });

  describe('B4: Chống Log Injection từ dữ liệu trụ', () => {
    it('messageId chứa ký tự xuống dòng không tạo dòng log giả mạo', async () => {
      const ws = await connectWs('CP-OK-B1');
      const logCountBefore = ocppLogs.length;

      const maliciousId = 'msg-b4\n[OCPP] INJECTED FAKE LOG LINE\n';
      const resPromise = receiveFrame(ws);
      ws.send(JSON.stringify([2, maliciousId, 'Heartbeat', {}]));
      await resPromise;

      const newLogs = ocppLogs.slice(logCountBefore);
      assert.ok(newLogs.length > 0, 'Phải có log được sinh ra');

      for (const entry of newLogs) {
        // Kiểm tra không có ký tự xuống dòng trần nào trong message
        assert.doesNotMatch(entry.msg, /\r?\n/, 'Nội dung log không được chứa ký tự xuống dòng trần');
        assert.notEqual(entry.msg, '[OCPP] INJECTED FAKE LOG LINE');
      }

      // Đảm bảo messageId được serialize an toàn bằng JSON.stringify
      assert.ok(newLogs.some((e) => e.msg.includes(JSON.stringify(maliciousId))));
      await closeWs(ws);
    });
  });

  describe('B7: BootNotification trả InternalError khi ghi DB thất bại', () => {
    it('Giả lập lỗi DB UPDATE -> trả CALLERROR InternalError, DB giữ nguyên UNKNOWN', async () => {
      failUpdate = true;
      try {
        const ws = await connectWs('CP-OK-B1');
        const resPromise = receiveFrame(ws);

        ws.send(JSON.stringify([
          2,
          'msg-b7-fail',
          'BootNotification',
          {
            chargePointVendor: 'GoodVendor',
            chargePointModel: 'GoodModel',
          },
        ]));

        const res = await resPromise;
        // B7: Phải trả CALLERROR InternalError với mô tả chung an toàn
        assert.strictEqual(res[0], 4);
        assert.strictEqual(res[1], 'msg-b7-fail');
        assert.strictEqual(res[2], 'InternalError');
        assert.strictEqual(res[3], 'Internal error');
        assert.deepEqual(res[4], {});

        // Kiểm tra DB không bị đổi sang ONLINE và vendor không đổi
        const dbCheck = await query("SELECT status, vendor FROM charge_points WHERE code = 'CP-OK-B1'");
        assert.strictEqual(dbCheck.rows[0].status, 'UNKNOWN');
        assert.strictEqual(dbCheck.rows[0].vendor, null);

        // Vì chưa được accepted, gửi Heartbeat sau đó phải bị SecurityError
        const hbPromise = receiveFrame(ws);
        ws.send(JSON.stringify([2, 'msg-hb-after-fail', 'Heartbeat', {}]));
        const hbRes = await hbPromise;
        assert.strictEqual(hbRes[0], 4);
        assert.strictEqual(hbRes[2], 'SecurityError');

        await closeWs(ws);
      } finally {
        failUpdate = false;
      }
    });
  });
});
