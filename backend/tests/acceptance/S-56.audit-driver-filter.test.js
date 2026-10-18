const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll, rollbackToMigration } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const auditRepository = require('../../src/modules/audit/audit.repository');
const { migrate, rollbackLastMigration } = require('../../src/db/migrate');

describe('S-56 audit log driver filter', { concurrency: false }, () => {
  let admin;
  let driverOne;
  let driverTwo;

  before(async () => {
    await resetSchema();
    assert.equal(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('audit-wallet-admin@test.invalid', 'ADMIN');
    driverOne = await createUser('audit-wallet-driver-one@test.invalid', 'DRIVER');
    driverTwo = await createUser('audit-wallet-driver-two@test.invalid', 'DRIVER');
    await auditRepository.record(admin.id, 'WALLET_TOPUP_MANUAL', 'wallet', driverOne.id, {
      driver_id: String(driverOne.id),
      amount_dong: '25000',
      receipt_code: 'PT-0001',
    });
    await auditRepository.record(admin.id, 'WALLET_ADJUST', 'wallet', driverOne.id, {
      driver_id: Number(driverOne.id),
      amount_dong: '-1000',
      reason: 'Đối soát sổ cái',
    });
    await auditRepository.record(admin.id, 'WALLET_UNLOCK', 'wallet', driverTwo.id, {
      driver_id: driverTwo.id,
      reason: 'Đã đối chiếu sổ cái',
    });
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('S-56 AC: lọc theo driver_id chỉ trả nhật ký ví của đúng tài xế', async () => {
    const response = await request(app)
      .get(`/api/audit-logs?driver_id=${driverOne.id}`)
      .set('Cookie', admin.cookie);

    assert.equal(response.status, 200);
    assert.equal(response.body.total, 2);
    assert.deepEqual(response.body.items.map((item) => item.action).sort(), [
      'WALLET_ADJUST',
      'WALLET_TOPUP_MANUAL',
    ]);
    assert.ok(response.body.items.every((item) => String(item.metadata.driver_id) === String(driverOne.id)));
  });

  it('S-56 AC: chỉ mục biểu thức hỗ trợ bộ lọc driver_id', async () => {
    const index = await query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = current_schema()
         AND indexname = 'audit_logs_driver_metadata_driver_id_idx'`
    );
    assert.equal(index.rowCount, 1);
    assert.ok(index.rows[0].indexdef.includes("metadata ->> 'driver_id'"));
  });

  it('migration 037 có thể chạy tiến, lùi rồi tiến lại', async () => {
    await rollbackToMigration('046_reservations.sql');
    for (const version of [
      '046_reservations.sql',
      '045_zero_watt_profile_limits.sql',
      '044_alerts_power_profile_log.sql',
      '043_station_power_limits.sql',
      '042_data_erasure_requests.sql',
      '041_accounting_period_locks.sql',
      '040_accounting_periods.sql',
      '039_notifications_and_email_outbox.sql',
      '038_wallet_topups.sql',
      '037_audit_logs_driver_id_index.sql',
    ]) {
      const latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
      assert.equal(latest.rows[0].version, version);
      assert.equal(await rollbackLastMigration(), true);
    }
    assert.equal((await query(
      `SELECT 1 FROM pg_indexes
       WHERE schemaname = current_schema()
         AND indexname = 'audit_logs_driver_metadata_driver_id_idx'`
    )).rowCount, 0);
    await migrate();
    assert.equal((await query(
      `SELECT 1 FROM pg_indexes
       WHERE schemaname = current_schema()
         AND indexname = 'audit_logs_driver_metadata_driver_id_idx'`
    )).rowCount, 1);
  });

  it('S-56 validation: driver_id phải là số nguyên dương an toàn', async () => {
    for (const value of ['0', '1x', '9007199254740992']) {
      const response = await request(app)
        .get(`/api/audit-logs?driver_id=${value}`)
        .set('Cookie', admin.cookie);
      assert.equal(response.status, 400);
    }
  });
});
