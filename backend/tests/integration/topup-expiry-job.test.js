const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { run, resetSchema, truncateAll, query } = require('../helpers/db');
const { closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { pool } = require('../../src/db/pool');
const { expirePendingTopups, startTopupExpiryJob } = require('../../src/modules/payments/topup-expiry-job');

describe('GYM-61 / S-35: Job chuyển lần nạp PENDING quá hạn sang EXPIRED', () => {
  let driver;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });

  beforeEach(async () => {
    await truncateAll();
    driver = await createUser('driver-expiry@test.invalid', 'DRIVER', 'password123');
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('chuyển các đơn nạp PENDING đã quá expires_at sang EXPIRED', async () => {
    // 1 đơn PENDING đã quá hạn
    await query(
      `INSERT INTO wallet_topups (driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at)
       VALUES ($1, 100000, 'PENDING', 'TU-EXPIRED-001', 'SANDBOX', 'key-exp-001', CURRENT_TIMESTAMP - INTERVAL '5 minutes')`,
      [driver.id]
    );

    // 1 đơn PENDING còn hạn (expires_at ở tương lai)
    await query(
      `INSERT INTO wallet_topups (driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at)
       VALUES ($1, 200000, 'PENDING', 'TU-VALID-001', 'SANDBOX', 'key-valid-001', CURRENT_TIMESTAMP + INTERVAL '25 minutes')`,
      [driver.id]
    );

    // 1 đơn đã SUCCESS dù expires_at ở quá khứ
    await query(
      `INSERT INTO wallet_topups (driver_id, amount_dong, status, order_ref, gateway, idempotency_key, expires_at)
       VALUES ($1, 300000, 'SUCCESS', 'TU-SUCCESS-001', 'SANDBOX', 'key-success-001', CURRENT_TIMESTAMP - INTERVAL '10 minutes')`,
      [driver.id]
    );

    const result = await expirePendingTopups(pool);
    assert.strictEqual(result.expiredCount, 1);

    const expiredRow = await query("SELECT status, failure_reason FROM wallet_topups WHERE order_ref = 'TU-EXPIRED-001'");
    assert.strictEqual(expiredRow.rows[0].status, 'EXPIRED');

    const validRow = await query("SELECT status FROM wallet_topups WHERE order_ref = 'TU-VALID-001'");
    assert.strictEqual(validRow.rows[0].status, 'PENDING');

    const successRow = await query("SELECT status FROM wallet_topups WHERE order_ref = 'TU-SUCCESS-001'");
    assert.strictEqual(successRow.rows[0].status, 'SUCCESS');
  });

  it('startTopupExpiryJob khởi tạo job và có thể stop() mà không lỗi', async () => {
    let logged = null;
    const job = startTopupExpiryJob({
      db: pool,
      intervalMs: 10000,
      logInfo: (msg) => { logged = msg; },
    });

    assert.ok(typeof job.run === 'function');
    assert.ok(typeof job.stop === 'function');

    await job.run();
    job.stop();
    assert.strictEqual(logged, null);
  });
});
