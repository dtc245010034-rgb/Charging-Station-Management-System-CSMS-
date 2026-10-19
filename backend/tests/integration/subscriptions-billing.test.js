'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { finalizeSession } = require('../../src/modules/billing/finalize-session');
const { build: buildReconciliation } = require('../../src/modules/reports/reconciliation');
const subscriptionsRepo = require('../../src/modules/billing/subscriptions.repository');

describe('S-65: Áp biểu giá gói khi lập hoá đơn (GYM-91, Bảng G01–G04, G09, G11)', { concurrency: false }, () => {
  let owner;
  let driver;
  let stationId;
  let connectorId;
  let chargePointId;
  let stationNoTariffId;
  let connectorNoTariffId;
  let chargePointNoTariffId;
  let planId;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    owner = await createUser('owner-sub-bill@test.invalid', 'STATION_OWNER');
    driver = await createUser('driver-sub-bill@test.invalid', 'DRIVER');

    // Nạp tiền cho ví tài xế
    await withTransaction((client) => postEntry(client, {
      driverId: driver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 2000000,
      receiptCode: `TOPUP-BILL-${Date.now()}`,
    }));

    // 1. Trạm có biểu giá trạm (4 000 đ/kWh)
    const stRes = await query(
      `INSERT INTO stations (name, address, latitude, longitude, status, owner_id, timezone)
       VALUES ('Trạm Có Biểu Giá', 'TP.HCM', 10.7, 106.6, 'ACTIVE', $1, 'Asia/Ho_Chi_Minh')
       RETURNING id`,
      [owner.id]
    );
    stationId = stRes.rows[0].id;

    const cpRes = await query(
      `INSERT INTO charge_points (station_id, code, status)
       VALUES ($1, 'CP-SUB-BILL-1', 'ONLINE')
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
       VALUES ($1, 0, 1440, 4000, 'Đồng giá trạm')`,
      [tariffId]
    );

    // 2. Trạm KHÔNG có biểu giá hiệu lực
    const stNoTariffRes = await query(
      `INSERT INTO stations (name, address, latitude, longitude, status, owner_id, timezone)
       VALUES ('Trạm Không Biểu Giá', 'TP.HCM', 10.7, 106.6, 'ACTIVE', $1, 'Asia/Ho_Chi_Minh')
       RETURNING id`,
      [owner.id]
    );
    stationNoTariffId = stNoTariffRes.rows[0].id;

    const cpNoTariffRes = await query(
      `INSERT INTO charge_points (station_id, code, status)
       VALUES ($1, 'CP-SUB-BILL-NO', 'ONLINE')
       RETURNING id`,
      [stationNoTariffId]
    );
    chargePointNoTariffId = cpNoTariffRes.rows[0].id;

    const connNoTariffRes = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
       VALUES ($1, 1, 'AVAILABLE', 'Available')
       RETURNING id`,
      [chargePointNoTariffId]
    );
    connectorNoTariffId = connNoTariffRes.rows[0].id;

    // 3. Tạo Gói Tháng 3.500: giá 300 000 đ, 30 ngày, 3 500 đ/kWh
    const plan = await subscriptionsRepo.insertPlan(undefined, {
      code: 'GOI_THANG_3500',
      name: 'Gói Tháng 3.500',
      priceDong: 300000,
      durationDays: 30,
      createdBy: owner.id,
    });
    planId = plan.id;

    await subscriptionsRepo.insertPeriods(undefined, planId, [
      { startMinute: 0, endMinute: 1440, pricePerKwhDong: 3500, label: 'Đồng giá gói' },
    ]);
  });

  after(async () => {
    await truncateAll();
    await closePool();
  });

  it('G01: Phiên 10 000 Wh, gói còn hạn lúc bắt đầu -> Hoá đơn 35 000 (trạm là 40 000), tariff_source=SUBSCRIPTION', async () => {
    const startsAt = '2026-10-10T10:00:00.000Z';
    const endsAt = '2026-11-09T10:00:00.000Z';

    const sub = await subscriptionsRepo.insertSubscription(undefined, {
      driverId: driver.id,
      planId,
      startsAt,
      endsAt,
      priceDong: 300000,
      idempotencyKey: 'idem-g01',
    });

    // Tạo phiên sạc bắt đầu lúc 2026-10-15 (gói còn hạn)
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         '2026-10-15T08:00:00.000Z', '2026-10-15T09:00:00.000Z',
         0, 10000, 'Local')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    const sessionId = sessionRes.rows[0].id;

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'FINAL');
    assert.equal(Number(result.invoice.totalDong), 35000);
    assert.equal(result.invoice.tariffSource, 'SUBSCRIPTION');
    assert.equal(result.invoice.subscriptionId, sub.id);
    assert.equal(result.invoice.tariffSnapshot.source, 'SUBSCRIPTION');
    assert.equal(result.invoice.tariffSnapshot.plan.code, 'GOI_THANG_3500');

    // Kiểm tra dòng sổ cái được ghi nhận qua postSessionInvoiceDebit
    const ledger = await query(
      "SELECT amount_dong FROM wallet_ledger WHERE session_id = $1 AND entry_type = 'SESSION_DEBIT'",
      [sessionId]
    );
    assert.equal(ledger.rowCount, 1);
    assert.equal(ledger.rows[0].amount_dong, '-35000');
  });

  it('G02: Phiên 12 345 Wh, có gói -> 12 345 × 3 500 / 1 000 = 43 208 (làm tròn nửa lên)', async () => {
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         '2026-10-16T08:00:00.000Z', '2026-10-16T09:00:00.000Z',
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
    // Phiên bắt đầu 1 phút sau khi gói hết hạn (2026-11-09T10:01:00.000Z)
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         '2026-11-09T10:01:00.000Z', '2026-11-09T11:00:00.000Z',
         0, 10000, 'Local')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    const sessionId = sessionRes.rows[0].id;

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'FINAL');
    assert.equal(Number(result.invoice.totalDong), 40000); // 10 000 Wh * 4 000 = 40 000
    assert.equal(result.invoice.tariffSource, 'STATION');
    assert.equal(result.invoice.subscriptionId, null);
  });

  it('G04: Phiên bắt đầu lúc gói còn hạn, kết thúc sau ends_at -> Vẫn tính giá gói theo thời điểm bắt đầu', async () => {
    // Gói hết hạn lúc 2026-11-09T10:00:00.000Z.
    // Phiên bắt đầu lúc 2026-11-09T09:30:00.000Z (còn hạn), kết thúc lúc 10:30 (quá hạn)
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         '2026-11-09T09:30:00.000Z', '2026-11-09T10:30:00.000Z',
         0, 10000, 'Local')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    const sessionId = sessionRes.rows[0].id;

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'FINAL');
    assert.equal(Number(result.invoice.totalDong), 35000);
    assert.equal(result.invoice.tariffSource, 'SUBSCRIPTION');
  });

  it('G11: Trạm không có biểu giá hiệu lực, tài xế có gói -> Vẫn REVIEW / NO_TARIFF', async () => {
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id, status,
         started_at, stopped_at, meter_start, meter_stop, stop_reason
       ) VALUES ($1, $2, 1, 'TAG-***', $3, 'COMPLETED',
         '2026-11-20T08:00:00.000Z', '2026-11-20T09:00:00.000Z',
         0, 10000, 'Local')
       RETURNING id`,
      [chargePointNoTariffId, connectorNoTariffId, driver.id]
    );
    const sessionId = sessionRes.rows[0].id;

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'REVIEW');
    assert.equal(result.reason, 'NO_TARIFF');
  });

  it('G09: Đối soát tháng 10/2026 có hoá đơn gói -> 0 lỗi', async () => {
    const report = await buildReconciliation({ from: '2026-10-01', to: '2026-10-31' });
    assert.equal(report.summary.issueCount, 0, 'Đối soát hoá đơn gói không được sinh lỗi');
    assert.equal(report.issues.length, 0);
  });
});
