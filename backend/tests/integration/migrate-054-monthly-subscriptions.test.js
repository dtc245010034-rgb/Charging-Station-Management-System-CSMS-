'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema, rollbackToMigration } = require('../helpers/db');

describe('migration 054: monthly subscriptions', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.equal(migrated.status, 0, migrated.stderr);
  });

  after(resetSchema);

  it('S-65 AC: seeds the fixed VIP offer and links ledger subscription fees uniquely', async () => {
    const plan = await query(
      "SELECT code, name, fee_dong, price_per_kwh_dong, duration_days FROM subscription_plans WHERE code = 'VIP'"
    );
    assert.deepEqual(plan.rows[0], {
      code: 'VIP',
      name: 'VIP',
      fee_dong: '299000',
      price_per_kwh_dong: '30000',
      duration_days: 30,
    });
    const column = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'wallet_ledger' AND column_name = 'subscription_id'"
    );
    assert.equal(column.rowCount, 1);
    const uniqueIndex = await query(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'wallet_ledger' AND indexname = 'wallet_ledger_subscription_fee_key'"
    );
    assert.match(uniqueIndex.rows[0].indexdef, /UNIQUE/);
  });

  it('S-65 AC: migration 054 rolls back and reapplies', async () => {
    await rollbackToMigration('054_monthly_subscriptions.sql');
    const down = run('src/db/migrate.js', ['down']);
    assert.equal(down.status, 0, down.stderr);
    const absent = await query("SELECT to_regclass('public.driver_subscriptions') AS table_name");
    assert.equal(absent.rows[0].table_name, null);
    const removedColumn = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'wallet_ledger' AND column_name = 'subscription_id'"
    );
    assert.equal(removedColumn.rowCount, 0);

    const up = run('src/db/migrate.js');
    assert.equal(up.status, 0, up.stderr);
    const present = await query("SELECT to_regclass('public.driver_subscriptions') AS table_name");
    assert.equal(present.rows[0].table_name, 'driver_subscriptions');
  });
});
