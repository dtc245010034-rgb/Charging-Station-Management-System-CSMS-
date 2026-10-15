const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, resetSchema, truncateAll, query } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { postStation, stationBody } = require('../helpers/station');

describe('S-52 · GYM-78 Nghiệm thu báo cáo doanh thu và sản lượng', () => {
  let ownerA;
  let ownerB;
  let accountant;
  let driver;
  let stationA;
  let cpA;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    ownerA = await createUser('owner-a@example.com', 'STATION_OWNER');
    ownerB = await createUser('owner-b@example.com', 'STATION_OWNER');
    accountant = await createUser('accountant@example.com', 'ACCOUNTANT');
    driver = await createUser('driver@example.com', 'DRIVER');

    // Tạo trạm A cho ownerA
    const resA = await postStation(ownerA, stationBody({ name: 'Trạm S1' }));
    stationA = resA.body;
    // Tạo trụ 1 với 2 đầu nối
    const resCpA = await request(app)
      .post(`/api/stations/${stationA.id}/charge-points`)
      .set('Cookie', ownerA.cookie)
      .send({ code: 'CP1', connector_count: 2 });
    cpA = resCpA.body;

    // Lấy connector ids
    const connRows = (await query('SELECT id, connector_no FROM connectors WHERE charge_point_id = $1 ORDER BY connector_no', [cpA.id])).rows;
    const conn1 = connRows[0].id;
    const conn2 = connRows[1].id;

    // Tạo trạm B cho ownerB
    await postStation(ownerB, stationBody({ name: 'Trạm S2' }));

    // Tạo 1 biểu giá mẫu cho Trạm S1
    const tariffRes = await query(
      `INSERT INTO tariffs (station_id, effective_from, version)
       VALUES ($1, '2026-01-01', 1) RETURNING id`,
      [stationA.id]
    );
    const tariffId = tariffRes.rows[0].id;

    // Dựng 4 phiên theo Bảng R mục 2:
    // C01: Trụ 1 · đầu nối 1: Wh = 10 000, Điện = 40 000, Chiếm trụ = 0, Tổng = 40 000
    // C14: Trụ 1 · đầu nối 1: Wh = 10 000, Điện = 40 000, Chiếm trụ = 38 000, Tổng = 78 000
    // C02: Trụ 1 · đầu nối 2: Wh = 3 001, Điện = 7 503, Chiếm trụ = 0, Tổng = 7 503
    // C17: Trụ 1 · đầu nối 2: Wh = 0, Điện = 0, Chiếm trụ = 0, Tổng = 0
    const periodDate = '2026-10-12';

    // Helper tạo session + invoice + lines
    async function createPricedSession({ connectorId, connectorNo, meterStart, meterStop, lines, totalDong, startedAt, stoppedAt }) {
      const sRes = await query(
        `INSERT INTO charging_sessions (
          charge_point_id, connector_id, connector_no, driver_id, status, meter_start, meter_stop,
          started_at, stopped_at, billing_status, id_tag_masked
        ) VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7, $8, 'FINAL', 'TAG***')
        RETURNING id`,
        [cpA.id, connectorId, connectorNo, driver.id, meterStart, meterStop, startedAt, stoppedAt]
      );
      const sId = sRes.rows[0].id;

      const invRes = await query(
        `INSERT INTO session_invoices (
          session_id, driver_id, station_id, tariff_id, tariff_snapshot,
          timezone, rounding_rule, total_dong, period_date, issued_at
        ) VALUES ($1, $2, $3, $4, '{}'::jsonb, 'Asia/Ho_Chi_Minh', 'PER_SEGMENT_HALF_UP', $5, $6, '2026-10-12T03:05:00Z')
        RETURNING id`,
        [sId, driver.id, stationA.id, tariffId, totalDong, periodDate]
      );
      const invId = invRes.rows[0].id;

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await query(
          `INSERT INTO invoice_lines (
            invoice_id, seq, kind, local_date, from_at, to_at, wh, price_per_kwh, minutes, per_min_dong, amount_dong
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            invId, i + 1, l.kind, periodDate,
            '2026-10-12T01:00:00Z', '2026-10-12T03:00:00Z',
            l.wh, l.pricePerKwh ?? null, l.minutes ?? null, l.perMinDong ?? null, l.amountDong
          ]
        );
      }
    }

    // C01
    await createPricedSession({
      connectorId: conn1,
      connectorNo: 1,
      meterStart: 0,
      meterStop: 10000,
      totalDong: 40000,
      startedAt: '2026-10-12T01:00:00Z',
      stoppedAt: '2026-10-12T03:00:00Z',
      lines: [
        { kind: 'ENERGY', wh: 10000, pricePerKwh: 4000, amountDong: 40000 }
      ]
    });

    // C14
    await createPricedSession({
      connectorId: conn1,
      connectorNo: 1,
      meterStart: 0,
      meterStop: 10000,
      totalDong: 78000,
      startedAt: '2026-10-12T03:30:00Z',
      stoppedAt: '2026-10-12T04:30:00Z',
      lines: [
        { kind: 'ENERGY', wh: 10000, pricePerKwh: 4000, amountDong: 40000 },
        { kind: 'IDLE', wh: 0, minutes: 38, perMinDong: 1000, amountDong: 38000 }
      ]
    });

    // C02
    await createPricedSession({
      connectorId: conn2,
      connectorNo: 2,
      meterStart: 1000,
      meterStop: 4001,
      totalDong: 7503,
      startedAt: '2026-10-12T01:00:00Z',
      stoppedAt: '2026-10-12T02:00:00Z',
      lines: [
        { kind: 'ENERGY', wh: 3001, pricePerKwh: 2500, amountDong: 7503 }
      ]
    });

    // C17
    await createPricedSession({
      connectorId: conn2,
      connectorNo: 2,
      meterStart: 5000,
      meterStop: 5000,
      totalDong: 0,
      startedAt: '2026-10-12T05:00:00Z',
      stoppedAt: '2026-10-12T05:30:00Z',
      lines: [
        { kind: 'ENERGY', wh: 0, pricePerKwh: 4000, amountDong: 0 }
      ]
    });
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('AC S-52: Bảng theo kỳ tự chọn có số phiên, tổng kWh, tổng tiền, phí chiếm trụ chia theo từng trụ khớp Bảng R', async () => {
    const res = await request(app)
      .get(`/api/reports/revenue?from=2026-10-01&to=2026-10-31&stationId=${stationA.id}`)
      .set('Cookie', ownerA.cookie);

    assert.strictEqual(res.status, 200);
    const { rows, summary } = res.body;

    // Kiểm tra từng đầu nối
    // Đầu nối 1: C01 + C14 = 2 phiên, 20 000 Wh, 80 000 Điện năng, 38 000 Chiếm trụ, 118 000 Tổng
    const rowConn1 = rows.find((r) => r.connectorNo === 1);
    assert.ok(rowConn1, 'Phải có dòng cho đầu nối 1');
    assert.strictEqual(rowConn1.sessions, 2);
    assert.strictEqual(rowConn1.totalWh, 20000);
    assert.strictEqual(rowConn1.energyDong, 80000);
    assert.strictEqual(rowConn1.idleDong, 38000);
    assert.strictEqual(rowConn1.totalDong, 118000);

    // Đầu nối 2: C02 + C17 = 2 phiên, 3 001 Wh, 7 503 Điện năng, 0 Chiếm trụ, 7 503 Tổng
    const rowConn2 = rows.find((r) => r.connectorNo === 2);
    assert.ok(rowConn2, 'Phải có dòng cho đầu nối 2');
    assert.strictEqual(rowConn2.sessions, 2);
    assert.strictEqual(rowConn2.totalWh, 3001);
    assert.strictEqual(rowConn2.energyDong, 7503);
    assert.strictEqual(rowConn2.idleDong, 0);
    assert.strictEqual(rowConn2.totalDong, 7503);

    // Tổng trạm: 4 phiên, 23 001 Wh, 87 503 Điện năng, 38 000 Chiếm trụ, 125 503 Tổng
    assert.strictEqual(summary.sessions, 4);
    assert.strictEqual(summary.totalWh, 23001);
    assert.strictEqual(summary.energyDong, 87503);
    assert.strictEqual(summary.idleDong, 38000);
    assert.strictEqual(summary.totalDong, 125503);
  });

  it('AC S-52: Chủ trạm CHỈ thấy trạm của mình; hỏi trạm người khác → 403 ACCESS_DENIED', async () => {
    // Chủ trạm B hỏi trạm của Chủ trạm A
    const resOther = await request(app)
      .get(`/api/reports/revenue?from=2026-10-01&to=2026-10-31&stationId=${stationA.id}`)
      .set('Cookie', ownerB.cookie);

    assert.strictEqual(resOther.status, 403);
    assert.strictEqual(resOther.body.error.code, 'FORBIDDEN');

    // Kiểm tra có audit log ACCESS_DENIED
    const auditRes = await query(
      "SELECT * FROM audit_logs WHERE user_id = $1 AND action = 'ACCESS_DENIED' AND entity = 'stations'",
      [ownerB.id]
    );
    assert.strictEqual(auditRes.rowCount, 1);

    // Chủ trạm B xem danh sách chung (không truyền stationId) chỉ thấy trạm của mình (Trạm S2)
    const resBList = await request(app)
      .get('/api/reports/revenue?from=2026-10-01&to=2026-10-31')
      .set('Cookie', ownerB.cookie);
    assert.strictEqual(resBList.status, 200);
    assert.ok(resBList.body.rows.every((r) => r.stationName === 'Trạm S2'));
    assert.strictEqual(resBList.body.summary.sessions, 0);
    assert.strictEqual(resBList.body.summary.totalDong, 0);
  });

  it('AC S-52: Kỳ trống trả bảng rỗng/đầu nối 0 phiên và tổng 0', async () => {
    const resEmpty = await request(app)
      .get(`/api/reports/revenue?from=2025-01-01&to=2025-01-31&stationId=${stationA.id}`)
      .set('Cookie', ownerA.cookie);

    assert.strictEqual(resEmpty.status, 200);
    assert.strictEqual(resEmpty.body.summary.sessions, 0);
    assert.strictEqual(resEmpty.body.summary.totalWh, 0);
    assert.strictEqual(resEmpty.body.summary.energyDong, 0);
    assert.strictEqual(resEmpty.body.summary.idleDong, 0);
    assert.strictEqual(resEmpty.body.summary.totalDong, 0);
    for (const row of resEmpty.body.rows) {
      assert.strictEqual(row.sessions, 0);
      assert.strictEqual(row.totalWh, 0);
      assert.strictEqual(row.totalDong, 0);
    }
  });

  it('AC S-52: Kế toán có thể xem báo cáo doanh thu trạm bất kỳ', async () => {
    const resAccountant = await request(app)
      .get(`/api/reports/revenue?from=2026-10-01&to=2026-10-31&stationId=${stationA.id}`)
      .set('Cookie', accountant.cookie);

    assert.strictEqual(resAccountant.status, 200);
    assert.strictEqual(resAccountant.body.summary.totalDong, 125503);
  });
});
