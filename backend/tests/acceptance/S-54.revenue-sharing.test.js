const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');

describe('S-54 AC: monthly partner revenue sharing (Bảng K01–K09)', () => {
  let admin;
  let ownerA;
  let ownerB;
  let ownerC;

  async function createInvoiceFixture({ stationId, chargePointId, connectorId, tariffId, periodDate, energyDong, idleDong }) {
    const sessionRes = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, meter_start,
         meter_stop, started_at, stopped_at, status, billing_status
       )
       VALUES ($1, $2, 1, 'TAG-K', 0, 1000, $3::timestamp, ($3::timestamp + INTERVAL '30 minutes'), 'COMPLETED', 'FINAL')
       RETURNING id`,
      [chargePointId, connectorId, `${periodDate}T10:00:00Z`]
    );
    const sessionId = sessionRes.rows[0].id;

    const totalDong = energyDong + idleDong;
    const invRes = await query(
      `INSERT INTO session_invoices (
         session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone,
         total_dong, period_date
       )
       VALUES ($1, NULL, $2, $3, '{}'::jsonb, 'Asia/Ho_Chi_Minh', $4, $5::date)
       RETURNING id`,
      [sessionId, stationId, tariffId, totalDong, periodDate]
    );
    const invoiceId = invRes.rows[0].id;

    let seq = 1;
    if (energyDong > 0) {
      await query(
        `INSERT INTO invoice_lines (invoice_id, seq, kind, local_date, from_at, to_at, wh, amount_dong)
         VALUES ($1, $2, 'ENERGY', $3::date, $4::timestamp, ($4::timestamp + INTERVAL '20 minutes'), 1000, $5)`,
        [invoiceId, seq++, periodDate, `${periodDate}T10:00:00Z`, energyDong]
      );
    }
    if (idleDong > 0) {
      await query(
        `INSERT INTO invoice_lines (invoice_id, seq, kind, local_date, from_at, to_at, wh, amount_dong)
         VALUES ($1, $2, 'IDLE', $3::date, ($4::timestamp + INTERVAL '20 minutes'), ($4::timestamp + INTERVAL '30 minutes'), 0, $5)`,
        [invoiceId, seq++, periodDate, `${periodDate}T10:00:00Z`, idleDong]
      );
    }
    return invoiceId;
  }

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.equal(migrated.status, 0, migrated.stderr);

    admin = await createUser('s54-admin@test.invalid', 'ADMIN');
    ownerA = await createUser('s54-owner-a@test.invalid', 'STATION_OWNER');
    ownerB = await createUser('s54-owner-b@test.invalid', 'STATION_OWNER');
    ownerC = await createUser('s54-owner-c@test.invalid', 'STATION_OWNER');

    // Thiết lập trạm, trụ, đầu nối, tariff cho Owner A
    const stationARes = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Station A', 'Address A', $1) RETURNING id",
      [ownerA.id]
    );
    const stationAId = stationARes.rows[0].id;
    const cpARes = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'CP-A', 'ONLINE') RETURNING id",
      [stationAId]
    );
    const cpAId = cpARes.rows[0].id;
    const connARes = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [cpAId]
    );
    const connAId = connARes.rows[0].id;
    const tariffARes = await query(
      "INSERT INTO tariffs (station_id, version, effective_from, created_by) VALUES ($1, 1, '2026-01-01', $2) RETURNING id",
      [stationAId, ownerA.id]
    );
    const tariffAId = tariffARes.rows[0].id;

    // Tỉ lệ chia Owner A (2 đoạn: từ 01/01 70%, từ 15/10 75%, đều include_idle)
    await query(
      "INSERT INTO partner_share_rates (owner_id, share_bp, include_idle, effective_from, created_by) VALUES ($1, 7000, true, '2026-01-01', $2)",
      [ownerA.id, admin.id]
    );
    await query(
      "INSERT INTO partner_share_rates (owner_id, share_bp, include_idle, effective_from, created_by) VALUES ($1, 7500, true, '2026-10-15', $2)",
      [ownerA.id, admin.id]
    );

    // Hóa đơn Owner A theo Bảng K:
    // Biên tháng 9: 2026-09-30 (50.000đ energy)
    await createInvoiceFixture({
      stationId: stationAId, chargePointId: cpAId, connectorId: connAId, tariffId: tariffAId,
      periodDate: '2026-09-30', energyDong: 50000, idleDong: 0,
    });
    // Đoạn 1 (01-14/10):
    await createInvoiceFixture({
      stationId: stationAId, chargePointId: cpAId, connectorId: connAId, tariffId: tariffAId,
      periodDate: '2026-10-10', energyDong: 120000, idleDong: 0,
    });
    await createInvoiceFixture({
      stationId: stationAId, chargePointId: cpAId, connectorId: connAId, tariffId: tariffAId,
      periodDate: '2026-10-12', energyDong: 80500, idleDong: 12000,
    });
    await createInvoiceFixture({
      stationId: stationAId, chargePointId: cpAId, connectorId: connAId, tariffId: tariffAId,
      periodDate: '2026-10-14', energyDong: 45250, idleDong: 0,
    });
    // Đoạn 2 (15-31/10):
    await createInvoiceFixture({
      stationId: stationAId, chargePointId: cpAId, connectorId: connAId, tariffId: tariffAId,
      periodDate: '2026-10-15', energyDong: 200000, idleDong: 6000,
    });
    await createInvoiceFixture({
      stationId: stationAId, chargePointId: cpAId, connectorId: connAId, tariffId: tariffAId,
      periodDate: '2026-10-20', energyDong: 33333, idleDong: 0,
    });
    // Biên tháng 11: 2026-11-01 (70.000đ energy)
    await createInvoiceFixture({
      stationId: stationAId, chargePointId: cpAId, connectorId: connAId, tariffId: tariffAId,
      periodDate: '2026-11-01', energyDong: 70000, idleDong: 0,
    });

    // Thiết lập trạm, trụ, đầu nối, tariff cho Owner B
    const stationBRes = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Station B', 'Address B', $1) RETURNING id",
      [ownerB.id]
    );
    const stationBId = stationBRes.rows[0].id;
    const cpBRes = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'CP-B', 'ONLINE') RETURNING id",
      [stationBId]
    );
    const cpBId = cpBRes.rows[0].id;
    const connBRes = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [cpBId]
    );
    const connBId = connBRes.rows[0].id;
    const tariffBRes = await query(
      "INSERT INTO tariffs (station_id, version, effective_from, created_by) VALUES ($1, 1, '2026-01-01', $2) RETURNING id",
      [stationBId, ownerB.id]
    );
    const tariffBId = tariffBRes.rows[0].id;

    // Tỉ lệ chia Owner B (60%, include_idle = false)
    await query(
      "INSERT INTO partner_share_rates (owner_id, share_bp, include_idle, effective_from, created_by) VALUES ($1, 6000, false, '2026-01-01', $2)",
      [ownerB.id, admin.id]
    );

    // Hóa đơn Owner B theo Bảng K:
    await createInvoiceFixture({
      stationId: stationBId, chargePointId: cpBId, connectorId: connBId, tariffId: tariffBId,
      periodDate: '2026-10-11', energyDong: 99999, idleDong: 5000,
    });
    await createInvoiceFixture({
      stationId: stationBId, chargePointId: cpBId, connectorId: connBId, tariffId: tariffBId,
      periodDate: '2026-10-25', energyDong: 10000, idleDong: 2500,
    });
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('chỉ tạo được bảng kê khi kỳ kế toán đã chốt', async () => {
    const notClosed = await request(app)
      .post('/api/settlements/2026-10/generate')
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(notClosed.status, 409);
    assert.equal(notClosed.body.error.code, 'PERIOD_NOT_CLOSED');
  });

  it('K01-K05 & K07: lập bảng kê tháng 10/2026 khớp toàn diện bảng đáp án K', async () => {
    await query(
      "INSERT INTO accounting_periods (month, status, closed_by, closed_at) VALUES ('2026-10-01', 'CLOSED', $1, CURRENT_TIMESTAMP)",
      [admin.id]
    );

    const res = await request(app)
      .post('/api/settlements/2026-10/generate')
      .set('Cookie', admin.cookie)
      .send({});

    assert.equal(res.status, 201);
    const { statement, lines, summary } = res.body;

    // K05: Toàn bảng kê: revenue_dong = 614.582, share_dong = 425.924, platform_dong = 188.658
    assert.equal(statement.revenue_dong, '614582');
    assert.equal(statement.share_dong, '425924');
    assert.equal(statement.platform_dong, '188658');
    assert.equal(summary.revenue_dong, '614582');
    assert.equal(summary.share_dong, '425924');
    assert.equal(summary.platform_dong, '188658');

    // K07: Ghi nhận reconciliation_issue_count
    assert.equal(typeof statement.reconciliation_issue_count, 'number');

    // Phân tích các dòng bảng kê (lines)
    assert.equal(lines.length, 3);

    // K01: Chủ trạm A, đoạn 1 (01-14/10, 70%): base = 257.750, share = 180.425
    const segA1 = lines.find((l) => Number(l.owner_id) === Number(ownerA.id) && l.share_bp === 7000);
    assert.ok(segA1, 'Phải có dòng đoạn 1 của Owner A');
    assert.equal(segA1.sessions, 3);
    assert.equal(segA1.energy_dong, '245750');
    assert.equal(segA1.idle_dong, '12000');
    assert.equal(segA1.base_dong, '257750');
    assert.equal(segA1.share_dong, '180425');
    assert.equal(segA1.include_idle, true);

    // K02: Chủ trạm A, đoạn 2 (15-31/10, 75%): base = 239.333, share = 179.500 (làm tròn nửa lên)
    const segA2 = lines.find((l) => Number(l.owner_id) === Number(ownerA.id) && l.share_bp === 7500);
    assert.ok(segA2, 'Phải có dòng đoạn 2 của Owner A');
    assert.equal(segA2.sessions, 2);
    assert.equal(segA2.energy_dong, '233333');
    assert.equal(segA2.idle_dong, '6000');
    assert.equal(segA2.base_dong, '239333');
    assert.equal(segA2.share_dong, '179500');
    assert.equal(segA2.include_idle, true);

    // K03: Chủ trạm A, tổng: share = 359.925, revenue = 497.083, platform = 137.158
    const ownerAShare = BigInt(segA1.share_dong) + BigInt(segA2.share_dong);
    const ownerARevenue = BigInt(segA1.energy_dong) + BigInt(segA1.idle_dong) + BigInt(segA2.energy_dong) + BigInt(segA2.idle_dong);
    assert.equal(ownerAShare.toString(), '359925');
    assert.equal(ownerARevenue.toString(), '497083');
    assert.equal((ownerARevenue - ownerAShare).toString(), '137158');

    // K04: Chủ trạm B (60%, KHÔNG chia phí chiếm trụ): base = 109.999, share = 65.999, revenue = 117.499, platform = 51.500
    const segB = lines.find((l) => Number(l.owner_id) === Number(ownerB.id));
    assert.ok(segB, 'Phải có dòng của Owner B');
    assert.equal(segB.sessions, 2);
    assert.equal(segB.share_bp, 6000);
    assert.equal(segB.include_idle, false);
    assert.equal(segB.energy_dong, '109999');
    assert.equal(segB.idle_dong, '7500');
    assert.equal(segB.base_dong, '109999');
    assert.equal(segB.share_dong, '65999');
    const ownerBRevenue = BigInt(segB.energy_dong) + BigInt(segB.idle_dong);
    assert.equal(ownerBRevenue.toString(), '117499');
    assert.equal((ownerBRevenue - BigInt(segB.share_dong)).toString(), '51500');

    // Audit log SETTLEMENT_GENERATED
    const auditRes = await query(
      "SELECT action, entity, metadata FROM audit_logs WHERE action = 'SETTLEMENT_GENERATED' ORDER BY id DESC LIMIT 1"
    );
    assert.equal(auditRes.rows[0]?.action, 'SETTLEMENT_GENERATED');
    assert.equal(auditRes.rows[0]?.entity, 'settlement_statement');
  });

  it('K06: thiếu tỷ lệ chia cho chủ trạm có phát sinh hoá đơn thì chặn 409 MISSING_RATE', async () => {
    // Tạo trạm và hóa đơn cho Owner C vào tháng 11/2026 (chưa có partner_share_rates)
    const stCRes = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Station C', 'Address C', $1) RETURNING id",
      [ownerC.id]
    );
    const stCId = stCRes.rows[0].id;
    const cpCRes = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'CP-C', 'ONLINE') RETURNING id",
      [stCId]
    );
    const cpCId = cpCRes.rows[0].id;
    const connCRes = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [cpCId]
    );
    const connCId = connCRes.rows[0].id;
    const tariffCRes = await query(
      "INSERT INTO tariffs (station_id, version, effective_from, created_by) VALUES ($1, 1, '2026-01-01', $2) RETURNING id",
      [stCId, ownerC.id]
    );
    const tariffCId = tariffCRes.rows[0].id;

    await createInvoiceFixture({
      stationId: stCId, chargePointId: cpCId, connectorId: connCId, tariffId: tariffCId,
      periodDate: '2026-11-10', energyDong: 100000, idleDong: 0,
    });

    await query(
      "INSERT INTO accounting_periods (month, status, closed_by, closed_at) VALUES ('2026-11-01', 'CLOSED', $1, CURRENT_TIMESTAMP)",
      [admin.id]
    );

    const res = await request(app)
      .post('/api/settlements/2026-11/generate')
      .set('Cookie', admin.cookie)
      .send({});

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'MISSING_RATE');
  });

  it('K08: cơ chế Duplicate và Versioning (không sinh bản mới nếu kỳ chưa mở lại)', async () => {
    // Gọi lại khi chưa mở lại kỳ 10/2026 => trả về duplicate: true
    const dupRes = await request(app)
      .post('/api/settlements/2026-10/generate')
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(dupRes.status, 200);
    assert.equal(dupRes.body.duplicate, true);
    assert.equal(dupRes.body.statement.version, 1);

    // Mở lại kỳ và chốt lại sau đó => sinh version 2 kèm supersedes_id
    const prevStmt = await query("SELECT id FROM settlement_statements WHERE month = '2026-10-01' ORDER BY version DESC LIMIT 1");
    await query(
      "UPDATE accounting_periods SET closed_at = CURRENT_TIMESTAMP + INTERVAL '1 second' WHERE month = '2026-10-01'"
    );

    const v2Res = await request(app)
      .post('/api/settlements/2026-10/generate')
      .set('Cookie', admin.cookie)
      .send({});
    assert.equal(v2Res.status, 201);
    assert.equal(v2Res.body.statement.version, 2);
    assert.equal(String(v2Res.body.statement.supersedes_id), String(prevStmt.rows[0].id));
  });

  it('K09: phân quyền xem bảng kê GET /api/settlements/:month', async () => {
    // Admin xem: thấy đầy đủ 3 lines và số liệu toàn hệ thống
    const adminRes = await request(app)
      .get('/api/settlements/2026-10')
      .set('Cookie', admin.cookie);
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.body.lines.length, 3);
    assert.equal(adminRes.body.statement.revenue_dong, '614582');
    assert.equal(adminRes.body.statement.share_dong, '425924');
    assert.equal(adminRes.body.statement.platform_dong, '188658');

    // Chủ trạm A: chỉ xem được 2 dòng của A, summary chỉ tính cho A, ẩn doanh thu hệ thống
    const ownerARes = await request(app)
      .get('/api/settlements/2026-10')
      .set('Cookie', ownerA.cookie);
    assert.equal(ownerARes.status, 200);
    assert.equal(ownerARes.body.lines.length, 2);
    assert.ok(ownerARes.body.lines.every((l) => Number(l.owner_id) === Number(ownerA.id)));
    assert.equal(ownerARes.body.summary.share_dong, '359925');
    assert.equal(ownerARes.body.summary.revenue_dong, '497083');
    assert.equal(ownerARes.body.summary.platform_dong, '137158');
    assert.equal(ownerARes.body.statement.revenue_dong, undefined);
    assert.equal(ownerARes.body.statement.share_dong, undefined);

    // Chủ trạm B: chỉ xem được 1 dòng của B
    const ownerBRes = await request(app)
      .get('/api/settlements/2026-10')
      .set('Cookie', ownerB.cookie);
    assert.equal(ownerBRes.status, 200);
    assert.equal(ownerBRes.body.lines.length, 1);
    assert.equal(Number(ownerBRes.body.lines[0].owner_id), Number(ownerB.id));
    assert.equal(ownerBRes.body.summary.share_dong, '65999');
    assert.equal(ownerBRes.body.summary.revenue_dong, '117499');

    // Chủ trạm C: không có trạm/hóa đơn trong kỳ 10/2026 => 404 SETTLEMENT_NOT_FOUND
    const ownerCRes = await request(app)
      .get('/api/settlements/2026-10')
      .set('Cookie', ownerC.cookie);
    assert.equal(ownerCRes.status, 404);
    assert.equal(ownerCRes.body.error.code, 'SETTLEMENT_NOT_FOUND');
  });

  it('VULN-S54-03: truy vấn tỉ lệ của người dùng không tồn tại trả về 404 thay vì 403', async () => {
    const nonExistent = await request(app)
      .get('/api/partners/999999/rates')
      .set('Cookie', ownerA.cookie);
    assert.equal(nonExistent.status, 404);
  });

  it('không cho chủ trạm tạo bảng kê hệ thống', async () => {
    const response = await request(app)
      .post('/api/settlements/2026-10/generate')
      .set('Cookie', ownerA.cookie)
      .send({});
    assert.equal(response.status, 403);
  });
});
