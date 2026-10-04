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
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createBootNotificationHandler } = require('../../src/modules/ocpp/handlers/boot-notification');

describe('T-16b & S-08 serialNumber: Admin Station Lock & BootNotification Serial', () => {
  let admin;
  let owner;
  let driver;
  let station;
  let server;
  let wss;
  let wsUrl;
  const clients = new Set();

  async function connectWs(code) {
    const ws = new WebSocket(`${wsUrl}/ocpp/${encodeURIComponent(code)}`, ['ocpp1.6']);
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

    admin = await createUser('admin-lock@example.com', 'ADMIN');
    owner = await createUser('owner-lock@example.com', 'STATION_OWNER');
    driver = await createUser('driver-lock@example.com', 'DRIVER');

    const createdStation = await postStation(owner, stationBody({ name: 'Trạm Lock Test' }));
    station = createdStation.body;

    // Tạo trụ mẫu thuộc trạm
    await request(app)
      .post(`/api/stations/${station.id}/charge-points`)
      .set('Cookie', owner.cookie)
      .send({ code: 'CP-LOCK-01' });

    // Dựng WebSocket Server với upgrade và message handler
    server = http.createServer();
    wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
    });

    const bootHandler = createBootNotificationHandler({
      pool,
      getHeartbeatInterval: () => 60,
    });

    const ocppMessages = createOcppMessageHandler({
      handlers: {
        BootNotification: bootHandler,
      },
    });

    wss.on('connection', (ws, code) => {
      ws.chargePointCode = code;
      ws.on('close', () => {
        ocppMessages.closeConnection(ws);
      });
      ws.on('message', (raw) => {
        void ocppMessages.handleMessage(ws, raw);
      });
    });

    server.on(
      'upgrade',
      createOcppUpgradeHandler({
        wss,
        lookupChargePoint: async (code) => {
          const res = await pool.query(
            `SELECT cp.id, cp.code, s.status AS station_status, s.locked_at
             FROM charge_points cp
             JOIN stations s ON s.id = cp.station_id
             WHERE cp.code = $1`,
            [code]
          );
          return res.rows[0] || null;
        },
      })
    );

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

  it('T-16b RBAC: Chưa đăng nhập trả về 401, không phải ADMIN trả về 403', async () => {
    // Không có cookie auth -> 401
    const unauth = await request(app)
      .patch(`/api/admin/stations/${station.id}/lock`)
      .send({ locked: true });
    assert.strictEqual(unauth.status, 401);

    // STATION_OWNER -> 403
    const ownerRes = await request(app)
      .patch(`/api/admin/stations/${station.id}/lock`)
      .set('Cookie', owner.cookie)
      .send({ locked: true });
    assert.strictEqual(ownerRes.status, 403);

    // DRIVER -> 403
    const driverRes = await request(app)
      .patch(`/api/admin/stations/${station.id}/lock`)
      .set('Cookie', driver.cookie)
      .send({ locked: true });
    assert.strictEqual(driverRes.status, 403);
  });

  it('T-16b Validation: Trạm không tồn tại trả về 404, body không hợp lệ trả về 400', async () => {
    // Trạm không tồn tại -> 404
    const notFound = await request(app)
      .patch('/api/admin/stations/999999/lock')
      .set('Cookie', admin.cookie)
      .send({ locked: true });
    assert.strictEqual(notFound.status, 404);

    // ID không hợp lệ (không phải số nguyên dương) -> 400
    const badId = await request(app)
      .patch('/api/admin/stations/abc/lock')
      .set('Cookie', admin.cookie)
      .send({ locked: true });
    assert.strictEqual(badId.status, 400);

    // Body thiếu locked -> 400
    const missingLocked = await request(app)
      .patch(`/api/admin/stations/${station.id}/lock`)
      .set('Cookie', admin.cookie)
      .send({});
    assert.strictEqual(missingLocked.status, 400);

    // locked không phải boolean -> 400
    const badLockedType = await request(app)
      .patch(`/api/admin/stations/${station.id}/lock`)
      .set('Cookie', admin.cookie)
      .send({ locked: 'true' });
    assert.strictEqual(badLockedType.status, 400);
  });

  it('T-16b & S-08: Admin khoá trạm -> BootNotification trả Rejected, Admin mở khoá -> BootNotification trả Accepted và lưu serial_number', async () => {
    // 1. Admin khoá trạm
    const lockRes = await request(app)
      .patch(`/api/admin/stations/${station.id}/lock`)
      .set('Cookie', admin.cookie)
      .send({ locked: true });
    assert.strictEqual(lockRes.status, 200);
    assert.ok(lockRes.body.locked_at, 'locked_at phải được gán');
    assert.strictEqual(String(lockRes.body.locked_by), String(admin.id), 'locked_by phải là id của admin');

    // Kiểm tra DB đã cập nhật
    const dbLocked = await query('SELECT locked_at, locked_by FROM stations WHERE id = $1', [station.id]);
    assert.ok(dbLocked.rows[0].locked_at);
    assert.strictEqual(String(dbLocked.rows[0].locked_by), String(admin.id));

    // Kiểm tra audit log
    const auditLock = await query("SELECT * FROM audit_logs WHERE action = 'LOCK' AND entity_id = $1", [station.id]);
    assert.strictEqual(auditLock.rowCount, 1);

    // 2. Trụ kết nối WebSocket và gửi BootNotification khi trạm đang bị khoá -> Rejected
    const ws1 = await connectWs('CP-LOCK-01');
    const rejPromise = receiveFrame(ws1);
    ws1.send(
      JSON.stringify([
        2,
        'msg-boot-rejected',
        'BootNotification',
        {
          chargePointVendor: 'TestVendor',
          chargePointModel: 'TestModel',
          chargePointSerialNumber: 'SN-REJECTED-001',
          firmwareVersion: '1.0.0',
        },
      ])
    );
    const rejFrame = await rejPromise;
    assert.strictEqual(rejFrame[0], 3);
    assert.strictEqual(rejFrame[2].status, 'Rejected');

    // Kiểm tra trạng thái trụ trong DB không đổi sang ONLINE
    const cpBefore = await query('SELECT status, serial_number FROM charge_points WHERE code = $1', ['CP-LOCK-01']);
    assert.notStrictEqual(cpBefore.rows[0].status, 'ONLINE');
    assert.strictEqual(cpBefore.rows[0].serial_number, null);

    await closeWs(ws1);

    // 3. Admin mở khoá trạm
    const unlockRes = await request(app)
      .patch(`/api/admin/stations/${station.id}/lock`)
      .set('Cookie', admin.cookie)
      .send({ locked: false });
    assert.strictEqual(unlockRes.status, 200);
    assert.strictEqual(unlockRes.body.locked_at, null);
    assert.strictEqual(unlockRes.body.locked_by, null);

    // Kiểm tra audit log UNLOCK
    const auditUnlock = await query("SELECT * FROM audit_logs WHERE action = 'UNLOCK' AND entity_id = $1", [station.id]);
    assert.strictEqual(auditUnlock.rowCount, 1);

    // 4. Trụ gửi BootNotification sau khi mở khoá -> Accepted và serial_number được lưu vào DB
    const ws2 = await connectWs('CP-LOCK-01');
    const accPromise = receiveFrame(ws2);
    ws2.send(
      JSON.stringify([
        2,
        'msg-boot-accepted',
        'BootNotification',
        {
          chargePointVendor: 'TestVendor',
          chargePointModel: 'TestModel',
          chargePointSerialNumber: 'SN-ACCEPTED-002',
          firmwareVersion: '2.0.0',
        },
      ])
    );
    const accFrame = await accPromise;
    assert.strictEqual(accFrame[0], 3);
    assert.strictEqual(accFrame[2].status, 'Accepted');

    // Kiểm tra DB thật: vendor, model, firmware_version, serial_number, status
    const cpAfter = await query(
      'SELECT vendor, model, firmware_version, serial_number, status FROM charge_points WHERE code = $1',
      ['CP-LOCK-01']
    );
    assert.strictEqual(cpAfter.rows[0].vendor, 'TestVendor');
    assert.strictEqual(cpAfter.rows[0].model, 'TestModel');
    assert.strictEqual(cpAfter.rows[0].firmware_version, '2.0.0');
    assert.strictEqual(cpAfter.rows[0].serial_number, 'SN-ACCEPTED-002');
    assert.strictEqual(cpAfter.rows[0].status, 'ONLINE');

    await closeWs(ws2);
  });
});
