'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('Migrations 054-055: Gói thuê bao và tính bất biến CSDL [GYM-91]', () => {
  let adminId;
  let driverId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);

    const admin = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Admin', 'sub-admin@test.invalid', 'hash') RETURNING id"
    );
    adminId = admin.rows[0].id;

    const driver = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Driver', 'sub-driver@test.invalid', 'hash') RETURNING id"
    );
    driverId = driver.rows[0].id;
  });

  after(resetSchema);

  it('subscription_plans: chỉ cho phép UPDATE active từ TRUE sang FALSE, cấm sửa trường khác, cấm DELETE/TRUNCATE', async () => {
    const planRes = await query(
      `INSERT INTO subscription_plans (code, name, price_dong, duration_days, created_by)
       VALUES ('PLAN-TEST-1', 'Gói Test 1', 300000, 30, $1)
       RETURNING id, active`,
      [adminId]
    );
    const planId = planRes.rows[0].id;
    assert.equal(planRes.rows[0].active, true);

    // 1. Cho phép retire: active TRUE -> FALSE
    await query(`UPDATE subscription_plans SET active = FALSE WHERE id = $1`, [planId]);
    const retired = await query('SELECT active FROM subscription_plans WHERE id = $1', [planId]);
    assert.equal(retired.rows[0].active, false);

    // 2. Cấm bật lại: active FALSE -> TRUE
    await assert.rejects(
      async () => {
        await query(`UPDATE subscription_plans SET active = TRUE WHERE id = $1`, [planId]);
      },
      /append-only except retiring active status/i
    );

    // 3. Cấm sửa giá
    await assert.rejects(
      async () => {
        await query(`UPDATE subscription_plans SET price_dong = 200000 WHERE id = $1`, [planId]);
      },
      /append-only except retiring active status/i
    );

    // 4. Cấm DELETE
    await assert.rejects(
      async () => {
        await query(`DELETE FROM subscription_plans WHERE id = $1`, [planId]);
      },
      /append-only except retiring active status/i
    );

    // 5. Cấm TRUNCATE
    await assert.rejects(
      async () => {
        await query(`TRUNCATE subscription_plans CASCADE`);
      },
      /append-only except retiring active status/i
    );
  });

  it('subscription_plan_periods: chỉ INSERT, cấm UPDATE/DELETE/TRUNCATE', async () => {
    const planRes = await query(
      `INSERT INTO subscription_plans (code, name, price_dong, duration_days, created_by)
       VALUES ('PLAN-PERIOD-TEST', 'Gói Test Khung', 300000, 30, $1)
       RETURNING id`,
      [adminId]
    );
    const planId = planRes.rows[0].id;

    await query(
      `INSERT INTO subscription_plan_periods (plan_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, 0, 1440, 3500, 'Đồng giá')`,
      [planId]
    );

    // Cấm UPDATE
    await assert.rejects(
      async () => {
        await query(`UPDATE subscription_plan_periods SET price_per_kwh_dong = 3000 WHERE plan_id = $1`, [planId]);
      },
      /subscription_plan_periods is append-only/i
    );

    // Cấm DELETE
    await assert.rejects(
      async () => {
        await query(`DELETE FROM subscription_plan_periods WHERE plan_id = $1`, [planId]);
      },
      /subscription_plan_periods is append-only/i
    );
  });

  it('subscriptions: chống trùng lặp, chống chồng hạn bằng exclusion constraint, cấm UPDATE/DELETE', async () => {
    const planRes = await query(
      `INSERT INTO subscription_plans (code, name, price_dong, duration_days, created_by)
       VALUES ('PLAN-SUB-TEST', 'Gói Đăng Ký', 300000, 30, $1)
       RETURNING id`,
      [adminId]
    );
    const planId = planRes.rows[0].id;

    const startsAt1 = '2026-10-01T00:00:00.000Z';
    const endsAt1 = '2026-10-31T00:00:00.000Z';

    const sub1 = await query(
      `INSERT INTO subscriptions (driver_id, plan_id, starts_at, ends_at, price_dong, idempotency_key)
       VALUES ($1, $2, $3, $4, 300000, 'idem-sub-1')
       RETURNING id`,
      [driverId, planId, startsAt1, endsAt1]
    );
    assert.ok(sub1.rows[0].id);

    // 1. Trùng idempotency_key cho cùng driver -> 23505
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO subscriptions (driver_id, plan_id, starts_at, ends_at, price_dong, idempotency_key)
           VALUES ($1, $2, '2026-11-01T00:00:00.000Z', '2026-11-30T00:00:00.000Z', 300000, 'idem-sub-1')`,
          [driverId, planId]
        );
      },
      (err) => err.code === '23505'
    );

    // 2. Chồng hạn [2026-10-15, 2026-11-15) với [2026-10-01, 2026-10-31) -> 23P01
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO subscriptions (driver_id, plan_id, starts_at, ends_at, price_dong, idempotency_key)
           VALUES ($1, $2, '2026-10-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z', 300000, 'idem-sub-overlap')`,
          [driverId, planId]
        );
      },
      (err) => err.code === '23P01'
    );

    // 3. Liền kề: starts_at đúng bằng ends_at của gói trước (2026-10-31T00:00:00.000Z) -> Hợp lệ
    const sub2 = await query(
      `INSERT INTO subscriptions (driver_id, plan_id, starts_at, ends_at, price_dong, idempotency_key)
       VALUES ($1, $2, '2026-10-31T00:00:00.000Z', '2026-11-30T00:00:00.000Z', 300000, 'idem-sub-adjacent')
       RETURNING id`,
      [driverId, planId]
    );
    assert.ok(sub2.rows[0].id);

    // 4. Cấm UPDATE subscriptions
    await assert.rejects(
      async () => {
        await query(`UPDATE subscriptions SET price_dong = 250000 WHERE id = $1`, [sub1.rows[0].id]);
      },
      /subscriptions is append-only/i
    );

    // 5. Cấm DELETE subscriptions
    await assert.rejects(
      async () => {
        await query(`DELETE FROM subscriptions WHERE id = $1`, [sub1.rows[0].id]);
      },
      /subscriptions is append-only/i
    );
  });

  it('wallet_ledger và session_invoices: trường subscription_id và chỉ mục từng phần hoạt động đúng', async () => {
    // 1. Kiểm tra cột tồn tại
    const ledgerCol = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'wallet_ledger' AND column_name = 'subscription_id'`
    );
    assert.equal(ledgerCol.rowCount, 1);

    const invoiceCol = await query(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'session_invoices' AND column_name IN ('subscription_id', 'tariff_source', 'tariff_id') ORDER BY column_name`
    );
    assert.equal(invoiceCol.rowCount, 3);
    const tariffIdCol = invoiceCol.rows.find((r) => r.column_name === 'tariff_id');
    assert.equal(tariffIdCol.is_nullable, 'YES');
  });
});
