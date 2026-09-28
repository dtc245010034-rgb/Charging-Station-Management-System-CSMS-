const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { run, query, resetSchema } = require('../helpers/db');

const demo = { ALLOW_DEMO_SEED: '1', DEMO_PASSWORD: 'DemoPass-2026' };

describe('GYM-14 seed-demo', () => {
  before(async () => { await resetSchema(); assert.strictEqual(run('src/db/migrate.js').status, 0); });
  after(resetSchema);

  it('từ chối chạy khi chưa xác nhận ALLOW_DEMO_SEED hoặc thiếu/ngắn DEMO_PASSWORD', () => {
    assert.strictEqual(run('scripts/seed-demo.js', [], { DEMO_PASSWORD: 'DemoPass-2026' }).status, 1);
    assert.strictEqual(run('scripts/seed-demo.js', [], { ALLOW_DEMO_SEED: '1' }).status, 1);
    assert.strictEqual(run('scripts/seed-demo.js', [], { ALLOW_DEMO_SEED: '1', DEMO_PASSWORD: 'short' }).status, 1);
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
});
