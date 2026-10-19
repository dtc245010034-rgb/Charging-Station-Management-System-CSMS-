'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { finalizeSession } = require('../../src/modules/billing/finalize-session');
const { build: buildReconciliation } = require('../../src/modules/reports/reconciliation');

describe('S-65: Nghiệm thu Gói thuê bao tháng (Bảng G01–G12) [GYM-91]', { concurrency: false }, () => {
  let admin;
  let owner;
  let driver;
  let driver2;
  let stationId;
  let chargePointId;
  let connectorId;
  let stationNoTariffId;
  let chargePointNoTariffId;
  let connectorNoTariffId;
  let planId;
  let planCode;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    admin = await createUser('s65-admin@test.invalid', 'ADMIN');
    owner = await createUser('s65-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('s65-driver@test.invalid', 'DRIVER');
    driver2 = await createUser('s65-driver2@test.invalid', 'DRIVER');

    // 1. Trạm có biểu giá 4 000 đ/kWh
    const stRes = await query(
      `INSERT INTO stations (name, address, latitude, longitude, status, owner_id, timezone)
       VALUES ('Trạm S65 Có Biểu Giá', 'Hà Nội', 21.0, 105.8, 'ACTIVE', $1, 'Asia/Ho_Chi_Minh')
       RETURNING id`,
      [owner.id]
    );
    stationId = stRes.rows[0].id;

    const cpRes = await query(
      `INSERT INTO charge_points (station_id, code, status)
       VALUES ($1, 'CP-S65-01', 'ONLINE')
       RETURNING id`,
      [stationId]
    );
    chargePointId = cpRes.rows[0].id;

    const connRes = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
       VALUES ($1, 1, 'AVAILABLE', 'Available')
       RETURNING id`,
      [chargePointId]
    );
    connectorId = connRes.rows[0].id;

    // Biểu giá trạm: 4 000 đ/kWh cả ngày
    const tariffRes = await query(
      `INSERT INTO tariffs (station_id, version, effective_from)
       VALUES ($1, 1, '2026-01-01')
       RETURNING id`,
      [stationId]
    );
    const tariffId = tariffRes.rows[0].id;

    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, 0, 1440, 4000, 'Đồng giá 4k')`,
      [tariffId]
    );

    // 2. Trạm KHÔNG có biểu giá
    const stNoRes = await query(
      `INSERT INTO stations (name, address, latitude, longitude, status, owner_id, timezone)
       VALUES ('Trạm S65 Không Biểu Giá', 'Hà Nội', 21.0, 105.8, 'ACTIVE', $1, 'Asia/Ho_Chi_Minh')
       RETURNING id`,
      [owner.id]
    );
    stationNoTariffId = stNoRes.rows[0].id;

    const cpNoRes = await query(
      `INSERT INTO charge_points (station_id, code, status)
       VALUES ($1, 'CP-S65-NO', 'ONLINE')
       RETURNING id`,
      [stationNoTariffId]
    );
    chargePointNoTariffId = cpNoRes.rows[0].id;

    const connNoRes = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
       VALUES ($1, 1, 'AVAILABLE', 'Available')
       RETURNING id`,
      [chargePointNoTariffId]
    );
    connectorNoTariffId = connNoRes.rows[0].id;

    // Tạo gói tháng: 300 000 đ, 30 ngày, 3 500 đ/kWh
    planCode = 'GOI_THANG_3500';
    const planRes = await query(
      `INSERT INTO subscription_plans (code, name, price_dong, duration_days, created_by)
       VALUES ($1, 'Gói Tháng 3.500', 300000, 30, $2)
       RETURNING id`,
      [planCode, admin.id]
    );
    planId = planRes.rows[0].id;

    await query(
      `INSERT INTO subscription_plan_periods (plan_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, 0, 1440, 3500, 'Đồng giá gói 3.5k')`,
      [planId]
    );

    // Nạp tiền cho driver: 500 000 đ
    await withTransaction(async (client) => {
      await postEntry(client, {
        driverId: driver.id,
        amountDong: 500000n,
        entryType: 'TOPUP_MANUAL',
        refId: 'SEED_DRIVER_500K',
      });
    });
  });

  after(async () => {
    await closePool();
  });

  it('G10: Phân quyền API gói - Tài xế gọi tạo gói => 403; Thiếu Idempotency-Key khi mua => 400', async () => {
    // Tài xế gọi POST /api/subscription-plans -> 403
    const resCreate = await request(app)
      .post('/api/subscription-plans')
      .set('Cookie', driver.cookie)
      .send({
        code: 'TEST_DRIVER_CREATE',
        name: 'Gói trái phép',
        priceDong: 100000,
        durationDays: 30,
        periods: [{ startMinute: 0, endMinute: 1440, pricePerKwhDong: 2000, label: 'Đồng giá' }],
      });
    assert.equal(resCreate.status, 403);

    // Mua gói nhưng thiếu Idempotency-Key -> 400
    const resBuyNoKey = await request(app)
      .post('/api/me/subscriptions')
      .set('Cookie', driver.cookie)
      .send({ planId });
    assert.equal(resBuyNoKey.status, 400);
  });

  it('G05: Mua gói khi ví 299 999 đ -> 409 INSUFFICIENT_BALANCE; Khi ví 300 000 đ -> Thành công', async () => {
    // Nạp cho driver2 299 999 đ
    await withTransaction(async (client) => {
      await postEntry(client, {
        driverId: driver2.id,
        amountDong: 299999n,
        entryType: 'TOPUP_MANUAL',
        refId: 'DRIVER2_TOPUP_299999',
      });
    });

    const resFail = await request(app)
      .post('/api/me/subscriptions')
      .set('Cookie', driver2.cookie)
      .set('Idempotency-Key', 'IDEMP-BUY-G05-FAIL')
      .send({ planId });
    assert.equal(resFail.status, 409);
    assert.equal(resFail.body.error?.code, 'INSUFFICIENT_BALANCE');

    // Nạp thêm đúng 1 đ -> tổng = 300 000 đ
    await withTransaction(async (client) => {
      await postEntry(client, {
        driverId: driver2.id,
        amountDong: 1n,
        entryType: 'TOPUP_MANUAL',
        refId: 'DRIVER2_TOPUP_1D',
      });
    });

    // Mua thành công
    const resSuccess = await request(app)
      .post('/api/me/subscriptions')
      .set('Cookie', driver2.cookie)
      .set('Idempotency-Key', 'IDEMP-BUY-G05-OK')
      .send({ planId });
    assert.equal(resSuccess.status, 201);
    assert.equal(Number(resSuccess.body.priceDong), 300000);

    // Kiểm tra số dư về 0
    const wRes = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver2.id]);
    assert.equal(wRes.rows[0].balance_dong, '0');

    // Kiểm tra dòng sổ cái SUBSCRIPTION_FEE
    const ledger = await query(
      "SELECT amount_dong, entry_type FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'SUBSCRIPTION_FEE'",
      [driver2.id]
    );
    assert.equal(ledger.rowCount, 1);
    assert.equal(ledger.rows[0].amount_dong, '-300000');
  });

  it('G06: Cùng Idempotency-Key trả lại gói cũ; Mua lần nữa khi còn hạn -> 409 SUBSCRIPTION_ACTIVE; Đua 10 yêu cầu song song', async () => {
    // 1. Cùng Idempotency-Key với driver2 -> Trả lại gói cũ
    const resDup = await request(app)
      .post('/api/me/subscriptions')
      .set('Cookie', driver2.cookie)
      .set('Idempotency-Key', 'IDEMP-BUY-G05-OK')
      .send({ planId });
    assert.equal(resDup.status, 201);
    assert.equal(Number(resDup.body.priceDong), 300000);

    // 2. Mua lần nữa với Idempotency-Key MỚI khi gói còn hạn -> 409 SUBSCRIPTION_ACTIVE
    const resActive = await request(app)
      .post('/api/me/subscriptions')
      .set('Cookie', driver2.cookie)
      .set('Idempotency-Key', 'IDEMP-BUY-G06-NEW-KEY')
      .send({ planId });
    assert.equal(resActive.status, 409);
    assert.equal(resActive.body.error?.code, 'SUBSCRIPTION_ACTIVE');

    // 3. Đua 10 yêu cầu song song từ driver (ví đang có 500 000 đ)
    const promises = Array.from({ length: 10 }).map((_, i) =>
      request(app)
        .post('/api/me/subscriptions')
        .set('Cookie', driver.cookie)
        .set('Idempotency-Key', `IDEMP-PARALLEL-${i}`)
        .send({ planId })
    );
    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.status === 201).length;
    const activeRejectCount = results.filter((r) => r.status === 409 && r.body.error?.code === 'SUBSCRIPTION_ACTIVE').length;

    assert.equal(successCount, 1, 'Chỉ đúng 1 yêu cầu mua gói thành công');
    assert.equal(activeRejectCount, 9, '9 yêu cầu còn lại bị chặn do trùng hạn');

    // Số dư driver: 500 000 - 300 000 = 200 000
    const wDriver = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id]);
    assert.equal(wDriver.rows[0].balance_dong, '200000');
  });

  it('G01: Phiên 10 000 Wh, gói còn hạn -> Hoá đơn 35 000 (trạm là 40 000), tariff_source=SUBSCRIPTION', async () => {
    // Đảm bảo session bắt đầu sau khi driver mua gói (now)
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         NOW() + INTERVAL '1 minute', NOW() + INTERVAL '61 minutes',
         0, 10000, 'Local')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    const sessionId = sessionRes.rows[0].id;

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'FINAL');
    assert.equal(Number(result.invoice.totalDong), 35000);
    assert.equal(result.invoice.tariffSource, 'SUBSCRIPTION');
    assert.equal(result.invoice.tariffSnapshot.plan.code, 'GOI_THANG_3500');
  });

  it('G02: Phiên 12 345 Wh, có gói -> 12 345 × 3 500 / 1 000 = 43 208 (làm tròn nửa lên)', async () => {
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         NOW() + INTERVAL '2 minutes', NOW() + INTERVAL '62 minutes',
         0, 12345, 'Local')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    const sessionId = sessionRes.rows[0].id;

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'FINAL');
    // 12 345 * 3 500 / 1 000 = 43 207.5 -> 43 208
    assert.equal(Number(result.invoice.totalDong), 43208);
    assert.equal(result.invoice.tariffSource, 'SUBSCRIPTION');
  });

  it('G03: Gói hết hạn 1 phút TRƯỚC giờ bắt đầu phiên -> Tính theo biểu giá trạm (10 000 Wh -> 40 000 đ)', async () => {
    // Tạo tài xế riêng driver3 có gói hết hạn trong quá khứ
    const driver3 = await createUser('s65-driver3@test.invalid', 'DRIVER');
    await query(
      `INSERT INTO subscriptions (driver_id, plan_id, starts_at, ends_at, price_dong, idempotency_key)
       VALUES ($1, $2, '2026-05-01T00:00:00.000Z', '2026-05-31T00:00:00.000Z', 300000, 'SUB-DR3-EXP')`,
      [driver3.id, planId]
    );

    // Phiên bắt đầu lúc 2026-05-31T00:01:00.000Z (sau khi gói hết hạn 1 phút)
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         '2026-05-31T00:01:00.000Z', '2026-05-31T01:00:00.000Z',
         0, 10000, 'Local')
       RETURNING id`,
      [chargePointId, connectorId, driver3.id]
    );
    const sessionId = sessionRes.rows[0].id;

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'FINAL');
    assert.equal(Number(result.invoice.totalDong), 40000);
    assert.equal(result.invoice.tariffSource, 'STATION');
    assert.equal(result.invoice.subscriptionId, null);
  });

  it('G04: Phiên bắt đầu lúc gói còn hạn, kết thúc sau ends_at -> Vẫn tính giá gói theo thời điểm bắt đầu', async () => {
    // Tài xế driver4 có gói hết hạn lúc 2026-06-30T10:00:00.000Z
    const driver4 = await createUser('s65-driver4@test.invalid', 'DRIVER');
    await query(
      `INSERT INTO subscriptions (driver_id, plan_id, starts_at, ends_at, price_dong, idempotency_key)
       VALUES ($1, $2, '2026-06-01T00:00:00.000Z', '2026-06-30T10:00:00.000Z', 300000, 'SUB-DR4-HALF')`,
      [driver4.id, planId]
    );

    // Bắt đầu lúc 09:30 (còn hạn), kết thúc 10:30 (quá hạn)
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         '2026-06-30T09:30:00.000Z', '2026-06-30T10:30:00.000Z',
         0, 10000, 'Local')
       RETURNING id`,
      [chargePointId, connectorId, driver4.id]
    );
    const sessionId = sessionRes.rows[0].id;

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'FINAL');
    assert.equal(Number(result.invoice.totalDong), 35000);
    assert.equal(result.invoice.tariffSource, 'SUBSCRIPTION');
  });

  it('G07: Mua lại đúng lúc gói cũ hết hạn (starts_at = ends_at cũ) -> Hợp lệ nhờ khoảng nửa mở [start, end)', async () => {
    const driver5 = await createUser('s65-driver5@test.invalid', 'DRIVER');
    // Gói cũ kết thúc vào 2026-07-01T00:00:00.000Z
    await query(
      `INSERT INTO subscriptions (driver_id, plan_id, starts_at, ends_at, price_dong, idempotency_key)
       VALUES ($1, $2, '2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', 300000, 'SUB-DR5-OLD')`,
      [driver5.id, planId]
    );

    // Gói mới bắt đầu chính xác từ 2026-07-01T00:00:00.000Z
    const insertNew = await query(
      `INSERT INTO subscriptions (driver_id, plan_id, starts_at, ends_at, price_dong, idempotency_key)
       VALUES ($1, $2, '2026-07-01T00:00:00.000Z', '2026-07-31T00:00:00.000Z', 300000, 'SUB-DR5-NEW')
       RETURNING id`,
      [driver5.id, planId]
    );
    assert.ok(insertNew.rows[0].id, 'Chèn thành công gói kế tiếp với starts_at = ends_at cũ');
  });

  it('G08: Tạo gói mới giá khác, ngừng bán gói cũ -> Hoá đơn và gói đã mua cũ KHÔNG đổi, gói cũ không mua được nữa', async () => {
    // 1. Ngừng bán gói cũ GOI_THANG_3500
    const resRetire = await request(app)
      .post(`/api/subscription-plans/${planId}/retire`)
      .set('Content-Type', 'application/json')
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(resRetire.status, 200);
    assert.equal(resRetire.body.active, false);

    // 2. Tạo gói mới giá khác (350 000 đ)
    const resNewPlan = await request(app)
      .post('/api/subscription-plans')
      .set('Content-Type', 'application/json')
      .set('Cookie', admin.cookie)
      .set('Idempotency-Key', 'S65-PLAN-NEW-400K') // POST tạo gói cần Idempotency-Key
      .send({
        code: 'GOI_THANG_NEW_400K',
        name: 'Gói Tháng Mới 400k',
        priceDong: 350000,
        durationDays: 30,
        periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3200, label: 'Đồng giá 3.2k' }],
      });
    assert.equal(resNewPlan.status, 201);
    const newPlanId = resNewPlan.body.id;

    // 3. Tài xế thử mua gói cũ đã ngừng bán -> 409 PLAN_NOT_ACTIVE
    const driver6 = await createUser('s65-driver6@test.invalid', 'DRIVER');
    await withTransaction(async (client) => {
      await postEntry(client, {
        driverId: driver6.id,
        amountDong: 500000n,
        entryType: 'TOPUP_MANUAL',
        refId: 'DRIVER6_TOPUP',
      });
    });

    const resBuyOld = await request(app)
      .post('/api/me/subscriptions')
      .set('Content-Type', 'application/json')
      .set('Cookie', driver6.cookie)
      .set('Idempotency-Key', 'IDEMP-BUY-OLD-RETIRED')
      .send({ planId });
    assert.equal(resBuyOld.status, 409);
    assert.equal(resBuyOld.body.error?.code, 'PLAN_NOT_ACTIVE');

    // 4. Mua gói mới thành công
    const resBuyNew = await request(app)
      .post('/api/me/subscriptions')
      .set('Content-Type', 'application/json')
      .set('Cookie', driver6.cookie)
      .set('Idempotency-Key', 'IDEMP-BUY-NEW-PLAN')
      .send({ planId: newPlanId });
    assert.equal(resBuyNew.status, 201);
    assert.equal(Number(resBuyNew.body.priceDong), 350000);
  });

  it('G11: Trạm không có biểu giá hiệu lực, tài xế có gói -> Vẫn REVIEW / NO_TARIFF', async () => {
    // Đặt vào tương lai xa để không ảnh hưởng reconciliation hôm nay
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         '2026-12-01T08:00:00.000Z', '2026-12-01T09:00:00.000Z',
         0, 10000, 'Local')
       RETURNING id`,
      [chargePointNoTariffId, connectorNoTariffId, driver.id]
    );
    const sessionId = sessionRes.rows[0].id;

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'REVIEW');
    assert.equal(result.reason, 'NO_TARIFF');
  });

  it('G12: Hoá đơn và lịch sử API trả về rõ ràng gói đang áp dụng', async () => {
    // Lấy danh sách lịch sử của driver
    const histRes = await request(app)
      .get('/api/me/sessions/history')
      .set('Cookie', driver.cookie);
    assert.equal(histRes.status, 200);
    const subSession = histRes.body.items.find((s) => s.tariffSource === 'SUBSCRIPTION');
    assert.ok(subSession, 'Tìm thấy phiên có tariffSource=SUBSCRIPTION');
    assert.equal(subSession.subscriptionPlanName, 'Gói Tháng 3.500');

    // Lấy chi tiết hoá đơn
    const invRes = await request(app)
      .get(`/api/sessions/${subSession.id}/invoice`)
      .set('Cookie', driver.cookie);
    assert.equal(invRes.status, 200);
    assert.equal(invRes.body.invoice.tariffSource, 'SUBSCRIPTION');
    assert.equal(invRes.body.invoice.tariffSnapshot.source, 'SUBSCRIPTION');
    assert.equal(invRes.body.invoice.tariffSnapshot.plan.code, 'GOI_THANG_3500');
  });

  it('G09: Đối soát kỳ có hoá đơn gói -> 0 lỗi', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const report = await buildReconciliation({ from: today, to: today });
    assert.equal(report.summary.issueCount, 0, 'Đối soát hoá đơn gói không được sinh lỗi');
    assert.equal(report.issues.length, 0);
  });
});
