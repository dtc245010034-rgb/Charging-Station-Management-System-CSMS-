const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 038: wallet_topups table [GYM-61]', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
  });
  after(resetSchema);

  it('AC GYM-61: bảng wallet_topups tồn tại với đầy đủ cột và ràng buộc', async () => {
    const tableRes = await query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wallet_topups'"
    );
    assert.strictEqual(tableRes.rowCount, 1, 'wallet_topups phải tồn tại');

    const driver = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Driver Topup', 'driver-topup-m038@test.invalid', 'hash') RETURNING id"
    );
    const driverId = driver.rows[0].id;

    // Chèn 1 dòng hợp lệ
    const inserted = await query(
      `INSERT INTO wallet_topups (
         driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at
       ) VALUES ($1, 200000, 'PENDING', 'TU-TEST-001', 'SANDBOX', 'idem-001', CURRENT_TIMESTAMP + INTERVAL '30 minutes')
       RETURNING *`,
      [driverId]
    );
    assert.strictEqual(inserted.rowCount, 1);
    assert.strictEqual(inserted.rows[0].status, 'PENDING');
    assert.strictEqual(inserted.rows[0].amount_dong, '200000');
    assert.strictEqual(inserted.rows[0].order_ref, 'TU-TEST-001');

    // Chặn amount_dong <= 0
    await assert.rejects(
      query(
        `INSERT INTO wallet_topups (
           driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at
         ) VALUES ($1, 0, 'PENDING', 'TU-TEST-002', 'SANDBOX', 'idem-002', CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
        [driverId]
      ),
      (err) => err.code === '23514' // check violation
    );

    // Chặn status không hợp lệ
    await assert.rejects(
      query(
        `INSERT INTO wallet_topups (
           driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at
         ) VALUES ($1, 50000, 'INVALID_STATUS', 'TU-TEST-003', 'SANDBOX', 'idem-003', CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
        [driverId]
      ),
      (err) => err.code === '23514' // check violation
    );

    // Chặn trùng order_ref
    await assert.rejects(
      query(
        `INSERT INTO wallet_topups (
           driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at
         ) VALUES ($1, 100000, 'PENDING', 'TU-TEST-001', 'SANDBOX', 'idem-004', CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
        [driverId]
      ),
      (err) => err.code === '23505' // unique violation
    );

    // Chặn trùng (driver_id, idempotency_key)
    await assert.rejects(
      query(
        `INSERT INTO wallet_topups (
           driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at
         ) VALUES ($1, 100000, 'PENDING', 'TU-TEST-005', 'SANDBOX', 'idem-001', CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
        [driverId]
      ),
      (err) => err.code === '23505' // unique violation
    );

    // Cho phép gateway_txn_id NULL nhiều dòng nhưng chặn trùng gateway_txn_id khác NULL
    await query(
      "UPDATE wallet_topups SET gateway_txn_id = 'GW-TXN-001' WHERE order_ref = 'TU-TEST-001'"
    );
    await query(
      `INSERT INTO wallet_topups (
         driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at
       ) VALUES ($1, 50000, 'PENDING', 'TU-TEST-006', 'SANDBOX', 'idem-006', CURRENT_TIMESTAMP + INTERVAL '30 minutes')`,
      [driverId]
    );
    await assert.rejects(
      query(
        "UPDATE wallet_topups SET gateway_txn_id = 'GW-TXN-001' WHERE order_ref = 'TU-TEST-006'"
      ),
      (err) => err.code === '23505' // unique violation
    );
  });

  it('AC GYM-61: rollback migration 038 gỡ wallet_topups sạch và có thể migrate up lại', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0]?.version !== '037_audit_logs_driver_id_index.sql') {
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
    }

    const tableAfterDown = await query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wallet_topups'"
    );
    assert.strictEqual(tableAfterDown.rowCount, 0, 'wallet_topups phải bị xóa sau down');

    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);

    const tableAfterUp = await query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'wallet_topups'"
    );
    assert.strictEqual(tableAfterUp.rowCount, 1, 'wallet_topups phải tồn tại sau up lại');
  });
});
