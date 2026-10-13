const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-64 (GYM-90): Lịch sử phiên sạc của tài xế', () => {
  let server;
  let baseUrl;
  let driverA;
  let driverB;
  let stationId;
  let chargePointId;
  let connectorId;
  const sessionsDriverA = [];

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();

    driverA = await createUser('driver-s64-a@test.invalid', 'DRIVER');
    driverB = await createUser('driver-s64-b@test.invalid', 'DRIVER');
    const owner = await createUser('owner-s64@test.invalid', 'STATION_OWNER');

    const stRes = await query(
      `INSERT INTO stations (name, address, owner_id, status, timezone)
       VALUES ('Trạm Lịch Sử S64', 'Hà Nội', $1, 'ACTIVE', 'Asia/Ho_Chi_Minh')
       RETURNING id`,
      [owner.id]
    );
    stationId = stRes.rows[0].id;

    const cpRes = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'CP-S64-01', 'ONLINE') RETURNING id",
      [stationId]
    );
    chargePointId = cpRes.rows[0].id;

    const connRes = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [chargePointId]
    );
    connectorId = connRes.rows[0].id;

    // 1. Tạo 120 phiên cho Driver A trong tháng 2026-10 (từ ngày 01 đến ngày 25)
    for (let i = 0; i < 120; i += 1) {
      const baseMs = Date.parse('2026-10-01T08:00:00.000Z') + i * 3_600_000;
      const startedAt = new Date(baseMs);
      const stoppedAt = new Date(baseMs + 1_800_000);
      const res = await query(
        `INSERT INTO charging_sessions (
           charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
           meter_start, meter_stop, started_at, stopped_at, status
         ) VALUES ($1, $2, 1, $3, $4, 10000, 15000, $5, $6, 'COMPLETED')
         RETURNING id`,
        [chargePointId, connectorId, driverA.id, `TAGA${String(i).padStart(3, '0')}`, startedAt, stoppedAt]
      );
      sessionsDriverA.push(res.rows[0].id);
    }

    // 2. Tạo phiên sát biên cuối tháng 10 theo giờ trạm Asia/Ho_Chi_Minh (UTC+7):
    // 2026-10-31 16:30:00Z = 2026-10-31 23:30:00 giờ trạm (vẫn thuộc tháng 10)
    await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status
       ) VALUES ($1, $2, 1, $3, 'TAG-OCT-EDGE', 10000, 12000,
         '2026-10-31T16:30:00.000Z', '2026-10-31T16:50:00.000Z', 'COMPLETED')`,
      [chargePointId, connectorId, driverA.id]
    );

    // 3. Tạo phiên đầu tháng 11 theo giờ trạm Asia/Ho_Chi_Minh:
    // 2026-10-31 17:30:00Z = 2026-11-01 00:30:00 giờ trạm (thuộc tháng 11)
    await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status
       ) VALUES ($1, $2, 1, $3, 'TAG-NOV-EDGE', 10000, 12000,
         '2026-10-31T17:30:00.000Z', '2026-10-31T17:50:00.000Z', 'COMPLETED')`,
      [chargePointId, connectorId, driverA.id]
    );

    // 4. Tạo phiên cho Driver B
    await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status
       ) VALUES ($1, $2, 1, $3, 'TAG-B', 10000, 12000,
         '2026-10-15T08:00:00.000Z', '2026-10-15T08:30:00.000Z', 'COMPLETED')`,
      [chargePointId, connectorId, driverB.id]
    );

    server = require('node:http').createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.closeAllConnections?.();
    await new Promise((resolve) => server?.close(resolve));
    await closePool();
    await resetSchema();
    run('src/db/migrate.js');
  });

  it('AC: phân trang 50 mục/trang, mới nhất trước', async () => {
    // Tổng số phiên của Driver A là 122 (120 + 2 phiên biên)
    const res1 = await fetch(`${baseUrl}/api/me/sessions/history?page=1`, {
      headers: { Cookie: driverA.cookie },
    });
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.items.length, 50, 'Trang 1 có 50 mục');
    assert.equal(body1.page, 1);
    assert.equal(body1.pageSize, 50);

    // Kiểm tra thứ tự mới nhất trước
    const t0 = new Date(body1.items[0].stoppedAt).getTime();
    const t1 = new Date(body1.items[1].stoppedAt).getTime();
    assert.ok(t0 >= t1, 'Phiên đầu phải mới hơn phiên sau');

    const res2 = await fetch(`${baseUrl}/api/me/sessions/history?page=2`, {
      headers: { Cookie: driverA.cookie },
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.items.length, 50, 'Trang 2 có 50 mục');
    assert.equal(body2.page, 2);

    const res3 = await fetch(`${baseUrl}/api/me/sessions/history?page=3`, {
      headers: { Cookie: driverA.cookie },
    });
    assert.equal(res3.status, 200);
    const body3 = await res3.json();
    assert.equal(body3.items.length, 22, 'Trang 3 có 22 mục');
    assert.equal(body3.page, 3);
  });

  it('AC: lọc theo tháng theo múi giờ trạm (Asia/Ho_Chi_Minh)', async () => {
    // Tháng 2026-10: gồm 120 phiên ban đầu + 1 phiên 23:30 ngày 31/10 = 121 phiên
    const resOct = await fetch(`${baseUrl}/api/me/sessions/history?month=2026-10&page=1`, {
      headers: { Cookie: driverA.cookie },
    });
    assert.equal(resOct.status, 200);
    const octBody = await resOct.json();
    assert.equal(octBody.total, 121);
    assert.equal(octBody.items.length, 50);

    // Tháng 2026-11: chỉ có 1 phiên bắt đầu lúc 00:30 ngày 01/11 giờ trạm (dù UTC là 17:30 ngày 31/10)
    const resNov = await fetch(`${baseUrl}/api/me/sessions/history?month=2026-11&page=1`, {
      headers: { Cookie: driverA.cookie },
    });
    assert.equal(resNov.status, 200);
    const novBody = await resNov.json();
    assert.equal(novBody.total, 1);
    assert.equal(novBody.items.length, 1);
    assert.equal(novBody.items[0].chargePointCode, 'CP-S64-01');

    // Tháng không có phiên
    const resEmpty = await fetch(`${baseUrl}/api/me/sessions/history?month=2026-09&page=1`, {
      headers: { Cookie: driverA.cookie },
    });
    assert.equal(resEmpty.status, 200);
    const emptyBody = await resEmpty.json();
    assert.equal(emptyBody.total, 0);
    assert.equal(emptyBody.items.length, 0);
  });

  it('Bảo mật / IDOR: Driver A không thấy phiên của Driver B', async () => {
    const resB = await fetch(`${baseUrl}/api/me/sessions/history?page=1`, {
      headers: { Cookie: driverB.cookie },
    });
    assert.equal(resB.status, 200);
    const bodyB = await resB.json();
    assert.equal(bodyB.total, 1);
    assert.equal(bodyB.items.length, 1);
    assert.ok(!sessionsDriverA.includes(bodyB.items[0].id));
  });

  it('Kiểm tra đầu vào: từ chối tham số tháng hoặc số trang không hợp lệ', async () => {
    const badMonth = await fetch(`${baseUrl}/api/me/sessions/history?month=invalid`, {
      headers: { Cookie: driverA.cookie },
    });
    assert.equal(badMonth.status, 400);

    const badMonth13 = await fetch(`${baseUrl}/api/me/sessions/history?month=2026-13`, {
      headers: { Cookie: driverA.cookie },
    });
    assert.equal(badMonth13.status, 400);

    const badPage = await fetch(`${baseUrl}/api/me/sessions/history?page=0`, {
      headers: { Cookie: driverA.cookie },
    });
    assert.equal(badPage.status, 400);
  });
});
