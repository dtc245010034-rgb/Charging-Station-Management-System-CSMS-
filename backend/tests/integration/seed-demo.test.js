const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { run, query, resetSchema } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');

const demo = { ALLOW_DEMO_SEED: '1', DEMO_PASSWORD: 'DemoPass-2026' };

describe('GYM-14 seed-demo', () => {
  before(async () => { await resetSchema(); assert.strictEqual(run('src/db/migrate.js').status, 0); });
  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('từ chối chạy khi chưa xác nhận ALLOW_DEMO_SEED hoặc thiếu/ngắn DEMO_PASSWORD', () => {
    assert.strictEqual(run('scripts/seed-demo.js', [], { DEMO_PASSWORD: 'DemoPass-2026' }).status, 1);
    assert.strictEqual(run('scripts/seed-demo.js', [], { ALLOW_DEMO_SEED: '1' }).status, 1);
    assert.strictEqual(run('scripts/seed-demo.js', [], { ALLOW_DEMO_SEED: '1', DEMO_PASSWORD: 'short' }).status, 1);
  });

  it('seed-demo-if-enabled (dùng trong start:staging, chạy được trên Windows): không có cờ thì bỏ qua và thoát 0', () => {
    const r = run('scripts/seed-demo-if-enabled.js', [], { ALLOW_DEMO_SEED: '' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /Bỏ qua seed demo/);
    assert.strictEqual(run('scripts/seed-demo-if-enabled.js', [], { ALLOW_DEMO_SEED: '1' }).status, 1); // bật cờ mà thiếu DEMO_PASSWORD thì vẫn lỗi
    const script = require('../../package.json').scripts['start:staging'];
    assert.ok(!script.includes('[ '), 'start:staging không được dùng cú pháp `[ ]` của shell');
  });

  it('tạo tài khoản đủ vai trò (kể cả tài khoản nhiều vai trò), trạm, trụ và đầu nối; không in mật khẩu', async () => {
    const r = run('scripts/seed-demo.js', [], demo);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes(demo.DEMO_PASSWORD) && !r.stderr.includes(demo.DEMO_PASSWORD));
    const roles = await query("SELECT u.email, array_agg(r.code ORDER BY r.code) AS roles FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id GROUP BY u.email ORDER BY u.email");
    assert.strictEqual(roles.rowCount, 6);
    assert.deepStrictEqual(roles.rows.find((x) => x.email.startsWith('multi@')).roles, ['OPERATOR', 'STATION_OWNER']);
    const counts = (await query('SELECT (SELECT count(*)::int FROM stations) s, (SELECT count(*)::int FROM charge_points) c, (SELECT count(*)::int FROM connectors) k')).rows[0];
    assert.deepStrictEqual(counts, { s: 6, c: 12, k: 24 });
    const hash = (await query("SELECT password_hash FROM users WHERE email LIKE 'owner@%'")).rows[0].password_hash;
    assert.ok(hash.startsWith('$argon2id$'));
  });

  it('chạy lại không tạo trùng và không ghi đè trạng thái trụ đã đổi', async () => {
    await query("UPDATE charge_points SET status = 'Available' WHERE code = 'DEMO-ST01-CP1'");
    const r = run('scripts/seed-demo.js', [], demo);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /0 tài khoản mới, 0 trạm mới, 0 trụ mới/);
    assert.strictEqual((await query('SELECT count(*)::int n FROM users')).rows[0].n, 6);
    assert.strictEqual((await query("SELECT status FROM charge_points WHERE code = 'DEMO-ST01-CP1'")).rows[0].status, 'Available');
  });

  it('mã trụ demo dùng tiền tố DEMO- để tách khỏi dữ liệu thật', async () => {
    assert.strictEqual((await query("SELECT count(*)::int n FROM charge_points WHERE code NOT LIKE 'DEMO-%'")).rows[0].n, 0);
  });

  it('S-45/S-65 AC: seed-demo tạo lịch hạn mức và gói VIP cho tài xế, chạy lại không nhân đôi', async () => {
    const stationLimit = await query(
      "SELECT power_limit_w FROM stations WHERE name = 'Trạm Cầu Giấy'"
    );
    assert.equal(stationLimit.rows[0].power_limit_w, 44000);
    const windows = await query(
      `SELECT start_minute, end_minute, limit_w
       FROM station_power_windows pw
       JOIN stations s ON s.id = pw.station_id
       WHERE s.name = 'Trạm Cầu Giấy' AND pw.deleted_at IS NULL
       ORDER BY start_minute`
    );
    assert.deepStrictEqual(windows.rows, [
      { start_minute: 0, end_minute: 360, limit_w: 22000 },
      { start_minute: 1020, end_minute: 1260, limit_w: 22000 },
    ]);
    const subscription = await query(
      `SELECT ds.plan_code, ds.fee_dong, ds.price_per_kwh_dong, wl.balance_dong
       FROM driver_subscriptions ds
       JOIN users u ON u.id = ds.driver_id
       JOIN wallets wl ON wl.driver_id = u.id
       WHERE u.email = 'driver@demo.csms.local'
         AND ds.idempotency_key = 'seed-demo-vip-subscription'`
    );
    assert.equal(subscription.rowCount, 1);
    assert.equal(subscription.rows[0].plan_code, 'VIP');
    assert.equal(subscription.rows[0].fee_dong, '299000');
    assert.equal(subscription.rows[0].price_per_kwh_dong, '30000');
    assert.equal(subscription.rows[0].balance_dong, '701000');

    const rerun = run('scripts/seed-demo.js', [], demo);
    assert.strictEqual(rerun.status, 0, rerun.stderr);
    assert.equal((await query(
      `SELECT count(*)::int AS count
       FROM driver_subscriptions ds
       JOIN users u ON u.id = ds.driver_id
       WHERE u.email = 'driver@demo.csms.local'`
    )).rows[0].count, 1);
    assert.equal((await query(
      `SELECT count(*)::int AS count
       FROM wallet_ledger wl
       JOIN users u ON u.id = wl.driver_id
       WHERE u.email = 'driver@demo.csms.local'
         AND wl.receipt_code = 'DEMO-SEED-DRIVER-WALLET-' || u.id::text`
    )).rows[0].count, 1);
  });

  it('S-45/S-50/S-51/S-65 AC: tools/demo-smoke.js kiểm tra API thật trên dữ liệu seed-demo', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    try {
      const { main } = require('../../../tools/demo-smoke');
      await main({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        emailDomain: 'demo.csms.local',
        demoPassword: demo.DEMO_PASSWORD,
      });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
