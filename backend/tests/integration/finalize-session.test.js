const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BASE, run, query, resetSchema } = require('../helpers/db');

process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || BASE;
process.env.JWT_SECRET ||= 'z'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';

const { finalizeSession, registerAfterInvoice } = require('../../src/modules/billing/finalize-session');
const handCases = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../fixtures/billing/hand-cases.json'),
  'utf8'
));
const CASE_IDS = ['C01', 'C03', 'C09', 'C16', 'C17'];

async function createCompletedSession(input, { needsReview = false, withoutDriver = false, withoutTariff = false } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const codeSuffix = suffix.toUpperCase();
  const owner = await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Test Owner', `owner-${suffix}@test.invalid`, 'hash']
  );
  const driver = withoutDriver ? null : await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Test Driver', `driver-${suffix}@test.invalid`, 'hash']
  );
  const station = await query(
    `INSERT INTO stations (name, address, latitude, longitude, owner_id, timezone)
     VALUES ($1, 'Test address', 21, 105, $2, $3) RETURNING id`,
    [`Test Station ${suffix}`, owner.rows[0].id, input.timezone]
  );
  const point = await query(
    'INSERT INTO charge_points (station_id, code) VALUES ($1, $2) RETURNING id',
    [station.rows[0].id, `CP-${codeSuffix}`]
  );
  const connector = await query(
    'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
    [point.rows[0].id]
  );

  let tariffId = null;
  if (!withoutTariff) {
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
       VALUES ($1, 1, '2026-10-01', $2, $3) RETURNING id`,
      [station.rows[0].id, input.tariff.idle.graceMin, input.tariff.idle.perMinDong]
    );
    tariffId = tariff.rows[0].id;
    for (const period of input.tariff.periods) {
      await query(
        `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
         VALUES ($1, $2, $3, $4, $5)`,
        [tariffId, period.startMin, period.endMin, period.pricePerKwh, period.label || null]
      );
    }
  }

  const session = await query(
    `INSERT INTO charging_sessions (
       charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
       status, needs_review, meter_start, meter_stop, started_at, stopped_at
     ) VALUES ($1, $2, 1, $3, $4, 'COMPLETED', $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      point.rows[0].id,
      connector.rows[0].id,
      driver?.rows[0].id ?? null,
      'TAG-INV',
      needsReview,
      input.meterStartWh,
      input.meterStopWh,
      input.startedAt,
      input.stoppedAt,
    ]
  );

  for (const sample of input.samples) {
    await query(
      `INSERT INTO meter_values (session_id, reported_at, sampled_at, measurand, value, unit, raw_unit, phase, context)
       VALUES ($1, $2, $2, 'Energy.Active.Import.Register', $3, 'Wh', 'Wh', '', 'Sample.Periodic')`,
      [session.rows[0].id, sample.at, sample.wh]
    );
  }

  return { sessionId: session.rows[0].id, stationId: station.rows[0].id, tariffId };
}

describe('finalizeSession [GYM-59]', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('AC S-33: lập hóa đơn chi tiết khớp các ca tay C01, C03, C09, C16, C17 và gọi lại không nhân đôi', async () => {
    for (const caseId of CASE_IDS) {
      const testCase = handCases.find((item) => item.id === caseId);
      const { sessionId } = await createCompletedSession(testCase.input);

      const first = await finalizeSession(sessionId);
      assert.equal(first.status, 'FINAL', `Ca ${caseId} phải được chốt`);
      assert.equal(String(first.invoice.totalDong), String(testCase.expected.totalDong), `Ca ${caseId}: tổng tiền`);
      assert.equal(first.invoice.lines.length, testCase.expected.lines.length, `Ca ${caseId}: số dòng`);
      for (let index = 0; index < testCase.expected.lines.length; index += 1) {
        const expected = testCase.expected.lines[index];
        const actual = first.invoice.lines[index];
        assert.equal(actual.kind, expected.kind, `Ca ${caseId}, dòng ${index + 1}: kind`);
        assert.equal(String(actual.wh), String(expected.wh), `Ca ${caseId}, dòng ${index + 1}: Wh`);
        assert.equal(String(actual.amountDong), String(expected.amountDong), `Ca ${caseId}, dòng ${index + 1}: tiền`);
      }

      const second = await finalizeSession(sessionId);
      assert.equal(second.status, 'FINAL', `Ca ${caseId}: gọi lại`);
      assert.equal(String(second.invoice.id), String(first.invoice.id), `Ca ${caseId}: giữ nguyên hóa đơn`);
      const count = await query('SELECT COUNT(*)::int AS count FROM session_invoices WHERE session_id = $1', [sessionId]);
      assert.equal(count.rows[0].count, 1, `Ca ${caseId}: chỉ một hóa đơn`);
    }
  });

  it('AC S-33: phiên needs_review hoặc thiếu biểu giá/tài xế ở REVIEW, không có hóa đơn FINAL', async () => {
    const input = handCases.find((item) => item.id === 'C01').input;
    for (const [options, reason] of [
      [{ needsReview: true }, 'NEEDS_REVIEW'],
      [{ withoutTariff: true }, 'NO_TARIFF'],
      [{ withoutDriver: true }, 'NO_DRIVER'],
    ]) {
      const { sessionId } = await createCompletedSession(input, options);
      const result = await finalizeSession(sessionId);
      assert.equal(result.status, 'REVIEW');
      assert.equal(result.reason, reason);
      assert.equal(result.invoice, undefined);
      const invoice = await query('SELECT 1 FROM session_invoices WHERE session_id = $1', [sessionId]);
      assert.equal(invoice.rowCount, 0);
    }
  });

  it('móc hậu hóa đơn lỗi thì rollback hóa đơn và chuyển phiên sang ERROR', async () => {
    const input = handCases.find((item) => item.id === 'C01').input;
    const { sessionId } = await createCompletedSession(input);
    const unregister = registerAfterInvoice(async () => {
      throw new Error('test hook failure');
    });
    let result;
    try {
      result = await finalizeSession(sessionId, { logError: () => {} });
    } finally {
      unregister();
    }

    assert.equal(result.status, 'ERROR');
    assert.equal((await query('SELECT 1 FROM session_invoices WHERE session_id = $1', [sessionId])).rowCount, 0);
    const session = await query(
      'SELECT billing_status, billing_attempts, billing_next_at FROM charging_sessions WHERE id = $1',
      [sessionId]
    );
    assert.equal(session.rows[0].billing_status, 'ERROR');
    assert.equal(session.rows[0].billing_attempts, 1);
    assert.ok(session.rows[0].billing_next_at);
  });

  it('không lập hóa đơn nếu phiên COMPLETED thiếu số đo cuối', async () => {
    const input = { ...handCases.find((item) => item.id === 'C01').input, meterStopWh: null };
    const { sessionId } = await createCompletedSession(input);
    const result = await finalizeSession(sessionId, { logError: () => {} });

    assert.equal(result.status, 'ERROR');
    assert.equal((await query('SELECT 1 FROM session_invoices WHERE session_id = $1', [sessionId])).rowCount, 0);
    const session = await query('SELECT billing_status FROM charging_sessions WHERE id = $1', [sessionId]);
    assert.equal(session.rows[0].billing_status, 'ERROR');
  });

  it('không tính hồi tố phiên cũ đã được migration đánh dấu SKIPPED', async () => {
    const input = handCases.find((item) => item.id === 'C01').input;
    const { sessionId } = await createCompletedSession(input);
    await query(
      "UPDATE charging_sessions SET billing_status = 'SKIPPED', billing_reason = 'EXISTING_COMPLETED_BEFORE_TARIFF' WHERE id = $1",
      [sessionId]
    );

    const result = await finalizeSession(sessionId);
    assert.equal(result.status, 'SKIPPED');
    assert.equal((await query('SELECT 1 FROM session_invoices WHERE session_id = $1', [sessionId])).rowCount, 0);
  });
});
