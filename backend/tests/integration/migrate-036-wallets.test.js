const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema, rollbackToMigration } = require('../helpers/db');

process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET ||= 'z'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';

describe('S-41 wallet ledger migration', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
  });
  after(resetSchema);

  it('AC S-41: wallet và ledger có khóa nghiệp vụ, cho phép số dư nợ và giữ bút toán signed', async () => {
    const owner = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      ['Test Owner', `wallet-owner-${Date.now()}@test.invalid`, 'hash']
    );
    const driver = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      ['Test Driver', `wallet-driver-${Date.now()}@test.invalid`, 'hash']
    );
    const station = await query(
      `INSERT INTO stations (name, address, latitude, longitude, owner_id)
       VALUES ('Test station', 'Test address', 21, 105, $1) RETURNING id`,
      [owner.rows[0].id]
    );
    const point = await query(
      'INSERT INTO charge_points (station_id, code) VALUES ($1, $2) RETURNING id',
      [station.rows[0].id, `WALLET-${Date.now()}`]
    );
    const connector = await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [point.rows[0].id]
    );
    const session = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, started_at, status
       ) VALUES ($1, $2, 1, $3, 'TAG', 0, CURRENT_TIMESTAMP, 'COMPLETED')
       RETURNING id`,
      [point.rows[0].id, connector.rows[0].id, driver.rows[0].id]
    );

    const wallet = await query(
      'INSERT INTO wallets (driver_id, balance_dong) VALUES ($1, -10000) RETURNING driver_id, balance_dong, locked',
      [driver.rows[0].id]
    );
    assert.deepStrictEqual(wallet.rows[0], {
      driver_id: driver.rows[0].id,
      balance_dong: '-10000',
      locked: false,
    });

    const entry = await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
       VALUES ($1, 'SESSION_DEBIT', -40000, -10000, $2, CURRENT_DATE)
       RETURNING amount_dong, balance_after_dong, session_id`,
      [driver.rows[0].id, session.rows[0].id]
    );
    assert.deepStrictEqual(entry.rows[0], {
      amount_dong: '-40000',
      balance_after_dong: '-10000',
      session_id: session.rows[0].id,
    });
  });

  it('AC S-41: ledger chống UPDATE, DELETE, TRUNCATE và trùng SESSION_DEBIT cùng phiên', async () => {
    const driver = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      ['Test Driver', `wallet-immutable-${Date.now()}@test.invalid`, 'hash']
    );
    const wallet = await query(
      'INSERT INTO wallets (driver_id) VALUES ($1) RETURNING driver_id',
      [driver.rows[0].id]
    );
    const owner = await query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      ['Test Owner', `wallet-owner-immutable-${Date.now()}@test.invalid`, 'hash']
    );
    const station = await query(
      `INSERT INTO stations (name, address, latitude, longitude, owner_id)
       VALUES ('Test station', 'Test address', 21, 105, $1) RETURNING id`,
      [owner.rows[0].id]
    );
    const point = await query(
      'INSERT INTO charge_points (station_id, code) VALUES ($1, $2) RETURNING id',
      [station.rows[0].id, `WALLET-I-${Date.now()}`]
    );
    const connector = await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [point.rows[0].id]
    );
    const session = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, started_at, status
       ) VALUES ($1, $2, 1, $3, 'TAG', 0, CURRENT_TIMESTAMP, 'COMPLETED')
       RETURNING id`,
      [point.rows[0].id, connector.rows[0].id, driver.rows[0].id]
    );
    const inserted = await query(
      `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
       VALUES ($1, 'SESSION_DEBIT', -1, -1, $2, CURRENT_DATE)
       RETURNING id`,
      [wallet.rows[0].driver_id, session.rows[0].id]
    );

    await assert.rejects(
      query('UPDATE wallet_ledger SET reason = $1 WHERE id = $2', ['tamper', inserted.rows[0].id]),
      (error) => error.code === '55000'
    );
    await assert.rejects(
      query('DELETE FROM wallet_ledger WHERE id = $1', [inserted.rows[0].id]),
      (error) => error.code === '55000'
    );
    await assert.rejects(
      query('TRUNCATE wallet_ledger'),
      (error) => error.code === '55000'
    );
    await assert.rejects(
      query(
        `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
         VALUES ($1, 'SESSION_DEBIT', -1, -2, $2, CURRENT_DATE)`,
        [wallet.rows[0].driver_id, session.rows[0].id]
      ),
      (error) => error.code === '23505'
    );
  });

  it('AC S-41: rollback migration 036 gỡ ví và ledger rồi có thể áp dụng lại', async () => {
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
      '036_wallets.sql',
    ]) {
      const latest = await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
      assert.equal(latest.rows[0].version, version);
      const rollback = run('src/db/migrate.js', ['down']);
      assert.strictEqual(rollback.status, 0, rollback.stderr);
    }
    assert.strictEqual(
      (await query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('wallets', 'wallet_ledger')")).rowCount,
      0
    );
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    assert.strictEqual(
      (await query("SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('wallets', 'wallet_ledger')")).rowCount,
      2
    );
  });
});
