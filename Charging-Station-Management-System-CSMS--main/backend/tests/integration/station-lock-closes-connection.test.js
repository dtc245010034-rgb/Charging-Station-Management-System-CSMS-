const http = require('node:http');
const { once } = require('node:events');
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { WebSocket, WebSocketServer } = require('ws');

const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { pool } = require('../../src/db/pool');
const connections = require('../../src/modules/charge-points/connection-registry');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');
const { createBootNotificationHandler } = require('../../src/modules/ocpp/handlers/boot-notification');
const { startKeepalive, registerOcppConnection } = require('../../src/modules/ocpp/ws-connection');
const { STATION_LOCKED_CLOSE_CODE, STATION_LOCKED_CLOSE_REASON } = require('../../src/lib/constants');

describe('N2: Khoá trạm đóng kết nối WebSocket đang mở', () => {
  let server;
  let wss;
  let keepalive;
  let wsUrl;
  let adminCookie;
  let ownerCookie;
  let driverCookie;
  let stationId;
  const cpCode = 'N2-LOCK-CP-01';

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();

    const admin = await createUser('admin-n2@test.invalid', 'ADMIN');
    const owner = await createUser('owner-n2@test.invalid', 'STATION_OWNER');
    const driver = await createUser('driver-n2@test.invalid', 'DRIVER');
    adminCookie = admin.cookie;
    ownerCookie = owner.cookie;
    driverCookie = driver.cookie;

    const createdStation = await postStation(owner, stationBody({ name: 'Station N2 Test' }));
    stationId = createdStation.body.id;

    await query(
      'INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, $3)',
      [stationId, cpCode, 'UNKNOWN']
    );

    // Thiết lập server OCPP WebSocket
    server = http.createServer();
    wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
    });

    keepalive = startKeepalive(wss, { pingIntervalMs: 30000 });

    const bootHandler = createBootNotificationHandler({
      pool,
      getHeartbeatInterval: () => 60,
    });

    const ocppMessages = createOcppMessageHandler({
      handlers: {
        BootNotification: bootHandler,
        Heartbeat: async () => ({ currentTime: new Date().toISOString() }),
        StatusNotification: async () => ({}),
      },
      updateLastSeen: async (connection) => {
        const code = connection?.chargePointCode || connection?.chargePoint?.code;
        if (!code || connection?.isStationLocked) return;
        try {
          await pool.query(
            'UPDATE charge_points cp SET last_seen_at = CURRENT_TIMESTAMP FROM stations s WHERE cp.station_id = s.id AND cp.code = $1 AND s.locked_at IS NULL',
            [code]
          );
        } catch {
          /* ignore */
        }
      },
    });

    server.on('upgrade', createOcppUpgradeHandler({
      wss,
      lookupChargePoint: async (code) => {
        const res = await pool.query(
          'SELECT cp.id, cp.code, cp.station_id, s.status AS station_status FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE cp.code = $1 LIMIT 1',
          [code]
        );
        return res.rows[0] || null;
      },
    }));

    wss.on('connection', (ws, code) => {
      registerOcppConnection(ws, code, {
        connections,
        ocppMessages,
        pool,
        rateLimitMax: 50,
      });
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    wsUrl = `ws://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (keepalive?.stop) keepalive.stop();
    if (wss) await new Promise((r) => wss.close(r));
    if (server?.listening) await new Promise((r) => server.close(r));
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  beforeEach(async () => {
    // Đảm bảo trạm không bị khoá trước mỗi test case
    await query('UPDATE stations SET locked_at = NULL, locked_by = NULL WHERE id = $1', [stationId]);
  });

  it('Yêu cầu 1: Khi lock thành công (locked=true) và trụ đang kết nối → đóng socket 1008 Station locked và DB về UNKNOWN qua B8', async () => {
    const client = new WebSocket(`${wsUrl}/ocpp/${cpCode}`, ['ocpp1.6']);
    await once(client, 'open');

    // 1. BootNotification để đưa trụ ONLINE
    const bootPromise = new Promise((resolve) => {
      client.on('message', (raw) => {
        const frame = JSON.parse(raw.toString());
        if (frame[1] === 'boot-1') resolve(frame);
      });
    });
    client.send(JSON.stringify([2, 'boot-1', 'BootNotification', { chargePointVendor: 'VendorX', chargePointModel: 'ModelY' }]));
    const bootRes = await bootPromise;
    assert.strictEqual(bootRes[2].status, 'Accepted');

    // Xác nhận trụ ONLINE trong DB
    const dbOnline = await query('SELECT status FROM charge_points WHERE code = $1', [cpCode]);
    assert.strictEqual(dbOnline.rows[0].status, 'ONLINE');
    assert.strictEqual(connections.isConnected(cpCode), true);

    // Chuẩn bị lắng nghe sự kiện close của client
    const closePromise = new Promise((resolve) => {
      client.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // 2. Admin gọi API lock trạm
    const lockRes = await request(app)
      .patch(`/api/admin/stations/${stationId}/lock`)
      .set('Cookie', adminCookie)
      .send({ locked: true });

    assert.strictEqual(lockRes.status, 200);
    assert.ok(lockRes.body.locked_at, 'locked_at phải được thiết lập');

    // 3. Client phải nhận được mã đóng 1008 và lý do "Station locked"
    const closeEvt = await closePromise;
    assert.strictEqual(closeEvt.code, STATION_LOCKED_CLOSE_CODE);
    assert.strictEqual(closeEvt.reason, STATION_LOCKED_CLOSE_REASON);

    // Chờ một chút để event close của B8 cập nhật DB
    await new Promise((r) => setTimeout(r, 100));

    // 4. Trạng thái trong DB phải là UNKNOWN (offline qua B8)
    const dbOffline = await query('SELECT status FROM charge_points WHERE code = $1', [cpCode]);
    assert.strictEqual(dbOffline.rows[0].status, 'UNKNOWN');
    assert.strictEqual(connections.isConnected(cpCode), false);
  });

  it('Yêu cầu 3: Mở khoá (locked=false) không đụng kết nối; trụ tự kết nối lại và Boot được Accepted', async () => {
    // 1. Khoá trạm trước
    await request(app)
      .patch(`/api/admin/stations/${stationId}/lock`)
      .set('Cookie', adminCookie)
      .send({ locked: true });

    // 2. Mở khoá trạm
    const unlockRes = await request(app)
      .patch(`/api/admin/stations/${stationId}/lock`)
      .set('Cookie', adminCookie)
      .send({ locked: false });

    assert.strictEqual(unlockRes.status, 200);
    assert.strictEqual(unlockRes.body.locked_at, null);

    // 3. Trụ kết nối lại và gửi BootNotification
    const client = new WebSocket(`${wsUrl}/ocpp/${cpCode}`, ['ocpp1.6']);
    await once(client, 'open');

    const bootPromise = new Promise((resolve) => {
      client.on('message', (raw) => {
        const frame = JSON.parse(raw.toString());
        if (frame[1] === 'boot-reconnect') resolve(frame);
      });
    });
    client.send(JSON.stringify([2, 'boot-reconnect', 'BootNotification', { chargePointVendor: 'VendorX', chargePointModel: 'ModelY' }]));
    const bootRes = await bootPromise;

    // BootNotification phải được Accepted sau khi mở khoá
    assert.strictEqual(bootRes[2].status, 'Accepted');

    const dbCheck = await query('SELECT status FROM charge_points WHERE code = $1', [cpCode]);
    assert.strictEqual(dbCheck.rows[0].status, 'ONLINE');

    client.close();
    await once(client, 'close');
    await new Promise((r) => setTimeout(r, 50));
  });

  it('Yêu cầu 4: Ca đua giữa lúc khoá và lúc đóng socket: tin đến không được ghi vào DB (kể cả last_seen_at)', async () => {
    const client = new WebSocket(`${wsUrl}/ocpp/${cpCode}`, ['ocpp1.6']);
    await once(client, 'open');

    // Boot để online
    const bootPromise = new Promise((resolve) => {
      client.on('message', (raw) => {
        const frame = JSON.parse(raw.toString());
        if (frame[1] === 'boot-race') resolve(frame);
      });
    });
    client.send(JSON.stringify([2, 'boot-race', 'BootNotification', { chargePointVendor: 'VendorX', chargePointModel: 'ModelY' }]));
    await bootPromise;

    // Lấy last_seen_at hiện tại
    const beforeSnap = await query('SELECT last_seen_at FROM charge_points WHERE code = $1', [cpCode]);
    const initialLastSeen = beforeSnap.rows[0].last_seen_at;

    // Đánh dấu isStationLocked trực tiếp (mô phỏng ca đua khi lock trạm đang đóng socket)
    const wsServerConn = connections.getConnection(cpCode);
    assert.ok(wsServerConn, 'Server connection phải tồn tại');
    wsServerConn.isStationLocked = true;

    // Gửi Heartbeat trong lúc này
    const hbPromise = new Promise((resolve) => {
      client.on('message', (raw) => {
        const frame = JSON.parse(raw.toString());
        if (frame[1] === 'hb-race') resolve(frame);
      });
    });
    client.send(JSON.stringify([2, 'hb-race', 'Heartbeat', {}]));
    const hbRes = await hbPromise;

    // Phản hồi phải là SecurityError: Station is locked
    assert.strictEqual(hbRes[0], 4);
    assert.strictEqual(hbRes[2], 'SecurityError');
    assert.strictEqual(hbRes[3], 'Station is locked');

    // Kiểm tra DB: last_seen_at KHÔNG đổi
    const afterSnap = await query('SELECT last_seen_at FROM charge_points WHERE code = $1', [cpCode]);
    assert.deepStrictEqual(afterSnap.rows[0].last_seen_at, initialLastSeen);

    client.close();
    await once(client, 'close');
    await new Promise((r) => setTimeout(r, 50));
  });

  it('Yêu cầu 5: Khoá trạm khi trụ không có kết nối vẫn trả 200, audit LOCK và phân quyền đúng', async () => {
    // Không có kết nối WebSocket nào mở
    assert.strictEqual(connections.isConnected(cpCode), false);

    // 1. Admin khoá trạm thành công trả 200
    const res = await request(app)
      .patch(`/api/admin/stations/${stationId}/lock`)
      .set('Cookie', adminCookie)
      .send({ locked: true });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.locked_at);

    // Kiểm tra audit log
    const auditRes = await query(
      "SELECT * FROM audit_logs WHERE action = 'LOCK' AND entity_id = $1 ORDER BY id DESC LIMIT 1",
      [stationId]
    );
    assert.strictEqual(auditRes.rowCount, 1);
    assert.strictEqual(auditRes.rows[0].action, 'LOCK');

    // 2. Chưa đăng nhập trả về 401
    const unauth = await request(app)
      .patch(`/api/admin/stations/${stationId}/lock`)
      .send({ locked: true });
    assert.strictEqual(unauth.status, 401);

    // 3. Owner trả về 403
    const ownerRes = await request(app)
      .patch(`/api/admin/stations/${stationId}/lock`)
      .set('Cookie', ownerCookie)
      .send({ locked: true });
    assert.strictEqual(ownerRes.status, 403);

    // 4. Driver trả về 403
    const driverRes = await request(app)
      .patch(`/api/admin/stations/${stationId}/lock`)
      .set('Cookie', driverCookie)
      .send({ locked: true });
    assert.strictEqual(driverRes.status, 403);

    // 5. Body sai (thiếu locked) trả về 400
    const badBody = await request(app)
      .patch(`/api/admin/stations/${stationId}/lock`)
      .set('Cookie', adminCookie)
      .send({});
    assert.strictEqual(badBody.status, 400);

    // 6. Trạm không tồn tại trả về 404
    const notFound = await request(app)
      .patch('/api/admin/stations/9999999/lock')
      .set('Cookie', adminCookie)
      .send({ locked: true });
    assert.strictEqual(notFound.status, 404);
  });
});
