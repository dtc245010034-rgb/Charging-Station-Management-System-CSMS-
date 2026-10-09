const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, closePool } = require('../helpers/app');
const { env, run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { pool } = require('../../src/db/pool');
const sessionsEvents = require('../../src/modules/sessions/sessions.events');

describe('S-22: Tài xế xem phiên đang sạc theo thời gian thực (Acceptance / Integration)', () => {
  let driver1;
  let driver2;
  let stationId;
  let chargePointId;
  let connectorId;
  let sessionActiveId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    // 1. Tạo users với vai trò khác nhau
    const owner = await createUser('owner@example.com', 'STATION_OWNER', 'password123');
    driver1 = await createUser('driver1@example.com', 'DRIVER', 'password123');
    driver2 = await createUser('driver2@example.com', 'DRIVER', 'password123');

    // 2. Tạo trạm, trụ, đầu nối
    const stRes = await pool.query(
      `INSERT INTO stations (name, address, latitude, longitude, status, owner_id)
       VALUES ('Trạm Quận 1', '123 Lê Lợi, Q.1', 10.7769, 106.7009, 'ACTIVE', $1)
       RETURNING id`,
      [owner.id]
    );
    stationId = stRes.rows[0].id;

    const cpRes = await pool.query(
      `INSERT INTO charge_points (station_id, code, status, model, vendor)
       VALUES ($1, 'CP-HCM-01', 'ONLINE', 'Terra 54', 'ABB')
       RETURNING id`,
      [stationId]
    );
    chargePointId = cpRes.rows[0].id;

    const connRes = await pool.query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
       VALUES ($1, 1, 'OCCUPIED', 'Charging')
       RETURNING id`,
      [chargePointId]
    );
    connectorId = connRes.rows[0].id;

    // 3. Tạo thẻ RFID ảo gắn cho driver 1
    const tagRes = await pool.query(
      `INSERT INTO id_tags (tag, user_id, status)
       VALUES ('TAG-DRIVER-1', $1, 'ACTIVE')
       RETURNING id`,
      [driver1.id]
    );
    const tagId = tagRes.rows[0].id;

    // 4. Tạo phiên sạc CHARGING cho driver 1
    const sessRes = await pool.query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_id, id_tag_masked,
         driver_id, meter_start, started_at, status
       )
       VALUES ($1, $2, 1, $3, 'ER-1', $4, 10000, CURRENT_TIMESTAMP - interval '15 minutes', 'CHARGING')
       RETURNING id`,
      [chargePointId, connectorId, tagId, driver1.id]
    );
    sessionActiveId = sessRes.rows[0].id;

    // 5. Thêm một số đo mẫu ban đầu
    await pool.query(
      `INSERT INTO meter_values (session_id, reported_at, sampled_at, measurand, value, unit, raw_unit)
       VALUES
         ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Energy.Active.Import.Register', 16500, 'Wh', 'Wh'),
         ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Power.Active.Import', 22000, 'W', 'W'),
         ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'Current.Import', 32, 'A', 'A')`,
      [sessionActiveId]
    );
  });

  after(async () => {
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('AC1: GET /api/me/sessions/current trả 200 kèm đầy đủ thông tin phiên đang sạc của chính mình', async () => {
    const res = await request(app)
      .get('/api/me/sessions/current')
      .set('Cookie', driver1.cookie);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, sessionActiveId);
    assert.strictEqual(res.body.station.name, 'Trạm Quận 1');
    assert.strictEqual(res.body.charge_point.code, 'CP-HCM-01');
    assert.strictEqual(res.body.connector.connector_no, 1);
    assert.strictEqual(res.body.meter_start, 10000);
    assert.strictEqual(res.body.status, 'CHARGING');
    assert.strictEqual(res.body.latest_reading.energy_wh, 16500);
    assert.strictEqual(res.body.latest_reading.energy_kwh, 6.5); // (16500 - 10000) / 1000
    assert.strictEqual(res.body.latest_reading.power_kw, 22);
    assert.strictEqual(res.body.latest_reading.current_a, 32);
    assert.ok(res.body.started_at);
  });

  it('AC3: GET /api/me/sessions/current trả 204 No Content khi tài xế không có phiên nào đang sạc', async () => {
    const res = await request(app)
      .get('/api/me/sessions/current')
      .set('Cookie', driver2.cookie);

    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.text, '');
  });

  it('AC4 & NFR: GET /api/sessions/:id trả 403 Forbidden khi tài xế cố truy cập phiên của người khác', async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionActiveId}`)
      .set('Cookie', driver2.cookie);

    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.body.error.code, 'FORBIDDEN');
  });

  it('GET /api/sessions/:id trả 200 khi chính chủ tài xế truy cập', async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionActiveId}`)
      .set('Cookie', driver1.cookie);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.id, sessionActiveId);
    assert.strictEqual(res.body.latest_reading.energy_kwh, 6.5);
  });

  it('Chưa đăng nhập truy cập GET /api/me/sessions/current hoặc /api/sessions/:id trả 401', async () => {
    const resCurrent = await request(app).get('/api/me/sessions/current');
    assert.strictEqual(resCurrent.status, 401);

    const resId = await request(app).get(`/api/sessions/${sessionActiveId}`);
    assert.strictEqual(resId.status, 401);
  });

  it('AC2: GET /api/me/sessions/events (SSE) nhận cập nhật số đo mới thời gian thực và cách ly theo tài xế', async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      // 1. Kết nối SSE bằng tài khoản driver1
      const response = await fetch(`http://127.0.0.1:${port}/api/me/sessions/events`, {
        headers: {
          Cookie: driver1.cookie,
          Accept: 'text/event-stream',
        },
      });
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Đọc retry header ban đầu
      const initialChunk = await reader.read();
      assert.ok(decoder.decode(initialChunk.value).includes('retry: 1000'));

      // 2. Phát một sự kiện thuộc về driver khác (driver2) -> driver1 KHÔNG được nhận
      sessionsEvents.publish({
        type: 'METER_VALUE',
        sessionId: 999,
        driverId: driver2.id,
        energy_kwh: 1.0,
      });

      // 3. Phát một sự kiện thuộc về driver1
      const eventPayload = {
        type: 'METER_VALUE',
        sessionId: sessionActiveId,
        driverId: driver1.id,
        energy_kwh: 7.2,
        power_kw: 21.5,
        current_a: 31.2,
        sampled_at: new Date().toISOString(),
      };
      sessionsEvents.publish(eventPayload);

      // Đọc message kế tiếp
      const nextChunk = await reader.read();
      const text = decoder.decode(nextChunk.value);
      assert.ok(text.includes('data: {'));
      assert.ok(text.includes('"energy_kwh":7.2'));
      assert.ok(text.includes(`"sessionId":${sessionActiveId}`));
      assert.ok(!text.includes('"sessionId":999'), 'Driver 1 không được nhận tin của Driver 2');

      await reader.cancel().catch(() => {});
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('SSE stream tự động đóng khi JWT hết hạn', { timeout: 15000 }, async () => {
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      // Ký token hết hạn sau 2 giây
      const shortToken = jwt.sign(
        { id: driver1.id, email: driver1.email, role: 'DRIVER', roles: ['DRIVER'], tv: 0 },
        env().JWT_SECRET,
        { expiresIn: 2 }
      );

      const response = await fetch(`http://127.0.0.1:${port}/api/me/sessions/events`, {
        headers: {
          Cookie: `token=${shortToken}`,
          Accept: 'text/event-stream',
        },
      });
      assert.strictEqual(response.status, 200);

      const reader = response.body.getReader();
      const startedAt = Date.now();
      let ended = false;
      const deadline = startedAt + 6000;

      while (Date.now() < deadline) {
        const { done } = await Promise.race([
          reader.read(),
          new Promise((resolve) => setTimeout(() => resolve({ done: false }), 500)),
        ]);
        if (done) {
          ended = true;
          break;
        }
      }
      await reader.cancel().catch(() => {});
      assert.ok(ended, 'SSE phải tự đóng khi token hết hạn');
      assert.ok(Date.now() - startedAt < 5000, 'Đóng sát mốc 2s');
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
