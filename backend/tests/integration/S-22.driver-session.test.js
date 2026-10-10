const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-22 Integration: API xem phiên sạc cho tài xế (T-47 / GYM-48)', () => {
  let server;
  let baseUrl;
  let driver1;
  let driver2;
  let owner;
  let admin;
  let sessionIdActive;
  let sessionIdCompleted;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();

    // Tạo các tài khoản
    driver1 = await createUser('driver1@test.invalid', 'DRIVER');
    driver2 = await createUser('driver2@test.invalid', 'DRIVER');
    owner = await createUser('owner-s22@test.invalid', 'STATION_OWNER');
    admin = await createUser('admin-s22@test.invalid', 'ADMIN');

    // Tạo trạm, trụ, đầu nối
    const stationRes = await query(
      "INSERT INTO stations (name, address, owner_id, status) VALUES ('Trạm Hoàn Kiếm', '1 Đinh Tiên Hoàng', $1, 'ACTIVE') RETURNING id",
      [owner.id]
    );
    const stationId = stationRes.rows[0].id;

    const cpRes = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'CP-HK-01', 'ONLINE') RETURNING id",
      [stationId]
    );
    const cpId = cpRes.rows[0].id;

    const connRes = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'OCCUPIED', 'Charging') RETURNING id",
      [cpId]
    );
    const connectorId = connRes.rows[0].id;

    // Tạo phiên sạc CHARGING cho driver1
    const s1Res = await query(`
      INSERT INTO charging_sessions (
        charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
        meter_start, started_at, status
      ) VALUES ($1, $2, 1, $3, 'A1B2', 10000, '2026-10-10T00:00:00Z', 'CHARGING')
      RETURNING id
    `, [cpId, connectorId, driver1.id]);
    sessionIdActive = s1Res.rows[0].id;

    // Chèn số đo cho phiên sessionIdActive
    await query(`
      INSERT INTO meter_values (session_id, reported_at, sampled_at, measurand, value, unit, raw_unit)
      VALUES
        ($1, '2026-10-10T00:05:00Z', '2026-10-10T00:05:00Z', 'Energy.Active.Import.Register', 15500, 'Wh', 'Wh'),
        ($1, '2026-10-10T00:05:00Z', '2026-10-10T00:05:00Z', 'Power.Active.Import', 22000, 'W', 'W'),
        ($1, '2026-10-10T00:05:00Z', '2026-10-10T00:05:00Z', 'Current.Import', 32, 'A', 'A')
    `, [sessionIdActive]);

    // Tạo phiên sạc COMPLETED cho driver2
    const s2Res = await query(`
      INSERT INTO charging_sessions (
        charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
        meter_start, meter_stop, started_at, stopped_at, stop_reason, status
      ) VALUES ($1, $2, 1, $3, 'C3D4', 5000, 25000, '2026-10-09T10:00:00Z', '2026-10-09T11:00:00Z', 'Local', 'COMPLETED')
      RETURNING id
    `, [cpId, connectorId, driver2.id]);
    sessionIdCompleted = s2Res.rows[0].id;

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('AC1: GET /api/me/sessions/current - tài xế có phiên CHARGING nhận thông tin đầy đủ kèm số đo và kWh', async () => {
    const res = await fetch(`${baseUrl}/api/me/sessions/current`, {
      headers: { Cookie: driver1.cookie },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.id, sessionIdActive);
    assert.strictEqual(data.charge_point_code, 'CP-HK-01');
    assert.strictEqual(data.station_name, 'Trạm Hoàn Kiếm');
    assert.strictEqual(data.connector_no, 1);
    assert.strictEqual(data.status, 'CHARGING');
    assert.strictEqual(data.meter_start, 10000);
    assert.strictEqual(data.current_kwh, 5.5); // (15500 - 10000) / 1000
    assert.strictEqual(data.latest_power_w, 22000);
    assert.strictEqual(data.latest_current_a, 32);
    assert.strictEqual(data.driver_id, Number(driver1.id));
  });

  it('AC3: GET /api/me/sessions/current - tài xế không có phiên CHARGING (hoặc chỉ có phiên đã đóng) trả về 204', async () => {
    const res = await fetch(`${baseUrl}/api/me/sessions/current`, {
      headers: { Cookie: driver2.cookie },
    });
    assert.strictEqual(res.status, 204);
  });

  it('NFR: GET /api/me/sessions/current - chưa đăng nhập trả về 401', async () => {
    const res = await fetch(`${baseUrl}/api/me/sessions/current`);
    assert.strictEqual(res.status, 401);
  });

  it('NFR: GET /api/me/sessions/current - người dùng không có vai trò DRIVER trả về 403', async () => {
    const res = await fetch(`${baseUrl}/api/me/sessions/current`, {
      headers: { Cookie: owner.cookie },
    });
    assert.strictEqual(res.status, 403);
  });

  it('AC1 / T-47: GET /api/sessions/:id - tài xế đọc đúng phiên của mình thành công', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionIdActive}`, {
      headers: { Cookie: driver1.cookie },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, sessionIdActive);
    assert.strictEqual(data.driver_id, Number(driver1.id));
    assert.strictEqual(data.current_kwh, 5.5);

    // Kiểm tra driver2 đọc phiên đã COMPLETED của mình
    const resCompleted = await fetch(`${baseUrl}/api/sessions/${sessionIdCompleted}`, {
      headers: { Cookie: driver2.cookie },
    });
    assert.strictEqual(resCompleted.status, 200);
    const completedData = await resCompleted.json();
    assert.strictEqual(completedData.status, 'COMPLETED');
    assert.strictEqual(completedData.current_kwh, 20); // (25000 - 5000) / 1000
  });

  it('AC4: GET /api/sessions/:id - tài xế đọc phiên của tài xế khác bị 403 và ghi vết audit_logs', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionIdActive}`, {
      headers: { Cookie: driver2.cookie }, // driver2 đọc phiên của driver1
    });
    assert.strictEqual(res.status, 403);

    // Kiểm tra audit_logs có ghi ACCESS_DENIED cho driver2 trên entity charging_sessions
    const auditRes = await query(
      "SELECT * FROM audit_logs WHERE user_id = $1 AND action = 'ACCESS_DENIED' AND entity = 'charging_sessions' AND entity_id = $2",
      [driver2.id, sessionIdActive]
    );
    assert.ok(auditRes.rows.length >= 1, 'phải ghi vết ACCESS_DENIED vào audit_logs');
  });

  it('AC4: GET /api/sessions/:id - phiên không tồn tại trả về 404', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/999999`, {
      headers: { Cookie: driver1.cookie },
    });
    assert.strictEqual(res.status, 404);
  });

  it('NFR: GET /api/sessions/:id - mã phiên không hợp lệ (chuỗi/số âm) trả về 400', async () => {
    const resBad = await fetch(`${baseUrl}/api/sessions/invalid-id`, {
      headers: { Cookie: driver1.cookie },
    });
    assert.strictEqual(resBad.status, 400);

    const resNeg = await fetch(`${baseUrl}/api/sessions/-5`, {
      headers: { Cookie: driver1.cookie },
    });
    assert.strictEqual(resNeg.status, 400);
  });

  it('Quyền quản trị: ADMIN đọc được phiên bất kỳ', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionIdActive}`, {
      headers: { Cookie: admin.cookie },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, sessionIdActive);
  });

  it('Quyền chủ trạm: STATION_OWNER đọc được phiên tại trạm của mình', async () => {
    const res = await fetch(`${baseUrl}/api/sessions/${sessionIdActive}`, {
      headers: { Cookie: owner.cookie },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.id, sessionIdActive);
  });
});
