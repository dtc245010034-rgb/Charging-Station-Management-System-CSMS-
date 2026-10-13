const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');
const { finalizeSession } = require('../../src/modules/billing/finalize-session');

describe('S-34 (GYM-60): Đổi biểu giá không làm đổi tiền của phiên đã kết thúc', () => {
  let owner;
  let driver;
  let stationId;
  let chargePointId;
  let connectorId;
  let t01SessionId;
  let t02SessionId;


  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    owner = await createUser('owner-s34@example.com', 'STATION_OWNER');
    driver = await createUser('driver-s34@example.com', 'DRIVER');

    const stRes = await postStation(owner, stationBody({ name: 'Trạm S34' }));
    stationId = stRes.body.id;
    await query("UPDATE stations SET timezone = 'Asia/Ho_Chi_Minh' WHERE id = $1", [stationId]);

    const cpRes = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'CP-S34-01', 'ONLINE') RETURNING id",
      [stationId]
    );
    chargePointId = cpRes.rows[0].id;

    const connRes = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [chargePointId]
    );
    connectorId = connRes.rows[0].id;

    // Tariff A (version 1, effective_from: '2026-10-20')
    // 3 khung giờ theo C09: 0-360: 2500, 360-1320: 4000, 1320-1440: 3000 đ/kWh
    const tariffARes = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong, created_by)
       VALUES ($1, 1, '2026-10-20', 15, 1000, $2) RETURNING id`,
      [stationId, owner.id]
    );
    const tariffAId = tariffARes.rows[0].id;

    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES
         ($1, 0, 360, 2500, 'Sáng'),
         ($1, 360, 1320, 4000, 'Ngày'),
         ($1, 1320, 1440, 3000, 'Đêm')`,
      [tariffAId]
    );

    // Tariff B (version 2, effective_from: '2026-10-21')
    // Phẳng 5000 đ/kWh
    const tariffBRes = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong, created_by)
       VALUES ($1, 2, '2026-10-21', 15, 1000, $2) RETURNING id`,
      [stationId, owner.id]
    );
    const tariffBId = tariffBRes.rows[0].id;

    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, 0, 1440, 5000, 'Cả ngày')`,
      [tariffBId]
    );
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('AC1: Biểu giá mới hiệu lực từ ngày mai → phiên hôm nay tính theo giá cũ, phiên ngày mai theo giá mới (kịch bản T01 = 22.003 đ, T02 = 50.000 đ)', async () => {
    // Phiên T01: 2026-10-20 23:00 → 2026-10-21 01:00 (giờ VN) = 2026-10-20T16:00:00Z -> 2026-10-20T18:00:00Z
    // Bắt đầu lúc Tariff A đang hiệu lực. Meter: 0 -> 8001 Wh. Có mẫu 4000 Wh lúc 00:00 VN (2026-10-20T17:00:00Z).
    const t01Res = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status
       ) VALUES ($1, $2, 1, $3, 'TAG-T01', 0, 8001,
         '2026-10-20T16:00:00.000Z', '2026-10-20T18:00:00.000Z', 'COMPLETED')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    t01SessionId = t01Res.rows[0].id;

    await query(
      `INSERT INTO meter_values (session_id, reported_at, sampled_at, measurand, value, unit, raw_unit, phase, context)
       VALUES ($1, '2026-10-20T17:00:00.000Z', '2026-10-20T17:00:00.000Z', 'Energy.Active.Import.Register', 4000, 'Wh', 'Wh', '', 'Sample.Periodic')`,
      [t01SessionId]
    );

    const finalizeT01 = await finalizeSession(t01SessionId);
    assert.equal(finalizeT01.status, 'FINAL');
    assert.equal(Number(finalizeT01.invoice.totalDong), 22003);
    assert.equal(finalizeT01.invoice.tariffSnapshot.version, 1);

    // Phiên T02: 2026-10-21 08:00 → 09:00 (giờ VN) = 2026-10-21T01:00:00Z -> 2026-10-21T02:00:00Z
    // Bắt đầu lúc Tariff B (phẳng 5000) đã hiệu lực. 10.000 Wh -> 50.000 đ.
    const t02Res = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status
       ) VALUES ($1, $2, 1, $3, 'TAG-T02', 10000, 20000,
         '2026-10-21T01:00:00.000Z', '2026-10-21T02:00:00.000Z', 'COMPLETED')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    t02SessionId = t02Res.rows[0].id;

    const finalizeT02 = await finalizeSession(t02SessionId);
    assert.equal(finalizeT02.status, 'FINAL');
    assert.equal(Number(finalizeT02.invoice.totalDong), 50000);
    assert.equal(finalizeT02.invoice.tariffSnapshot.version, 2);
  });

  it('AC1: Hoá đơn cũ mở lại sau khi đổi biểu giá vẫn giữ đúng đơn giá lịch sử và tổng tiền', async () => {
    // Mở lại hoá đơn T01 qua API
    const resT01 = await request(app)
      .get(`/api/sessions/${t01SessionId}/invoice`)
      .set('Cookie', driver.cookie);

    assert.equal(resT01.status, 200);
    assert.equal(resT01.body.status, 'FINAL');
    assert.equal(Number(resT01.body.invoice.totalDong), 22003);
    assert.equal(resT01.body.invoice.tariff.version, 1);
    assert.equal(resT01.body.invoice.lines.length, 2);
    // Đoạn đêm (23:00 - 00:00): 4000 Wh * 3000 = 12000 đ
    assert.equal(Number(resT01.body.invoice.lines[0].pricePerKwh), 3000);
    assert.equal(Number(resT01.body.invoice.lines[0].amountDong), 12000);
    // Đoạn sáng (00:00 - 01:00): 4001 Wh * 2500 = 10003 đ
    assert.equal(Number(resT01.body.invoice.lines[1].pricePerKwh), 2500);
    assert.equal(Number(resT01.body.invoice.lines[1].amountDong), 10003);

    // Mở lại hoá đơn T02 qua API
    const resT02 = await request(app)
      .get(`/api/sessions/${t02SessionId}/invoice`)
      .set('Cookie', driver.cookie);

    assert.equal(resT02.status, 200);
    assert.equal(resT02.body.status, 'FINAL');
    assert.equal(Number(resT02.body.invoice.totalDong), 50000);
    assert.equal(resT02.body.invoice.tariff.version, 2);
    assert.equal(resT02.body.invoice.lines.length, 1);
    assert.equal(Number(resT02.body.invoice.lines[0].pricePerKwh), 5000);
    assert.equal(Number(resT02.body.invoice.lines[0].amountDong), 50000);
  });

  it('AC2: Cố tình đặt ngày hiệu lực trong quá khứ bị từ chối (400/409)', async () => {
    // Ngày quá khứ cứng
    const resPast = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: '2020-01-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3000 }],
      });
    assert.equal(resPast.status, 400);

    // Ngày hôm qua tính theo múi giờ trạm
    const yesterday = new Date(Date.now() - 86400000);
    const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(yesterday);
    const resYesterday = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: yesterdayStr,
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3000 }],
      });
    assert.equal(resYesterday.status, 400);

    // Tạo biểu giá trong tương lai
    const resFuture = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: '2099-12-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 4500 }],
      });
    assert.equal(resFuture.status, 201);

    // Cố tình tạo trùng ngày hiệu lực 2099-12-01 -> 409 Conflict
    const resDuplicate = await request(app)
      .post(`/api/stations/${stationId}/tariffs`)
      .set('Cookie', owner.cookie)
      .send({
        effectiveFrom: '2099-12-01',
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 4800 }],
      });
    assert.equal(resDuplicate.status, 409);
  });
});
