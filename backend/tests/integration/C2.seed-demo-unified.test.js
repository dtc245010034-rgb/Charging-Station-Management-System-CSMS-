const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { run, query, resetSchema } = require('../helpers/db');
const { ACCOUNTS, emailOf } = require('../../scripts/lib/demo-accounts');

const repoRoot = path.resolve(__dirname, '../../..');
const demo = { ALLOW_DEMO_SEED: '1', DEMO_PASSWORD: 'DemoPass-2026-Ok' };

describe('C2: một bộ seed demo duy nhất', () => {
  before(async () => { await resetSchema(); assert.strictEqual(run('src/db/migrate.js').status, 0); });
  after(resetSchema);

  it('từ chối DEMO_PASSWORD ngắn hơn 12 ký tự và nói rõ lý do', () => {
    const r = run('scripts/seed-demo.js', [], { ALLOW_DEMO_SEED: '1', DEMO_PASSWORD: 'Short-pass1' });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /tối thiểu 12 ký tự/);
  });

  it('chạy 2 lần liên tiếp: lần 2 không tạo thêm gì, dữ liệu nền đầy đủ cho kịch bản demo', async () => {
    const first = run('scripts/seed-demo.js', [], demo);
    assert.strictEqual(first.status, 0, first.stderr);
    const snapshot = async () => (await query(`SELECT
      (SELECT count(*)::int FROM users) users, (SELECT count(*)::int FROM tariffs) tariffs,
      (SELECT count(*)::int FROM tariff_periods) periods, (SELECT count(*)::int FROM subscription_plans) plans,
      (SELECT count(*)::int FROM subscription_plan_periods) plan_periods, (SELECT count(*)::int FROM wallet_ledger) ledger,
      (SELECT count(*)::int FROM station_power_windows) windows, (SELECT count(*)::int FROM partner_share_rates) shares`)).rows[0];
    const before = await snapshot();
    const second = run('scripts/seed-demo.js', [], demo);
    assert.strictEqual(second.status, 0, second.stderr);
    assert.match(second.stdout, /0 biểu giá, 0 khung công suất, 0 lần nạp ví, 0 gói thuê bao, 0 tỷ lệ chia sẻ doanh thu/);
    assert.deepStrictEqual(await snapshot(), before);
    assert.deepStrictEqual(before, { users: ACCOUNTS.length, tariffs: 7, periods: 7, plans: 1, plan_periods: 1, ledger: 1, windows: 1, shares: 2 });
  });

  it('có đủ tài khoản trong bảng dùng chung, kể cả ADMIN, đăng nhập bằng DEMO_PASSWORD băm argon2id', async () => {
    const rows = (await query('SELECT u.email, array_agg(r.code ORDER BY r.code) roles, u.password_hash FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id GROUP BY u.id')).rows;
    for (const account of ACCOUNTS) {
      const row = rows.find((x) => x.email === emailOf(account.key));
      assert.ok(row, `thiếu tài khoản ${account.key}`);
      assert.deepStrictEqual(row.roles, [...account.roles].sort());
      assert.ok(row.password_hash.startsWith('$argon2id$'));
    }
    assert.ok(ACCOUNTS.some((a) => a.roles.includes('ADMIN')));
  });

  it('gói thuê bao demo đang hoạt động: 300.000 đ/30 ngày, 3.500 đ/kWh cả ngày', async () => {
    const plan = (await query("SELECT id, price_dong::int p, duration_days, active FROM subscription_plans WHERE code = 'GOI_THANG_DEMO_3500'")).rows[0];
    assert.deepStrictEqual({ p: plan.p, d: plan.duration_days, a: plan.active }, { p: 300000, d: 30, a: true });
    const period = (await query('SELECT start_minute, end_minute, price_per_kwh_dong::int k FROM subscription_plan_periods WHERE plan_id = $1', [plan.id])).rows;
    assert.deepStrictEqual(period, [{ start_minute: 0, end_minute: 1440, k: 3500 }]);
  });

  it('ví tài xế đủ mua gói và Σ sổ cái = số dư ví', async () => {
    const wallet = (await query("SELECT w.balance_dong::int b, (SELECT COALESCE(sum(amount_dong), 0)::int FROM wallet_ledger l WHERE l.driver_id = w.driver_id) s FROM wallets w JOIN users u ON u.id = w.driver_id WHERE u.email = $1", [emailOf('driver')])).rows[0];
    assert.ok(wallet.b >= 300000);
    assert.strictEqual(wallet.b, wallet.s);
  });

  it('trạm đầu tiên có phí không đến riêng, hạn mức nền, khung cao điểm 17:00–20:00 hạ 15 kW và biểu giá hiệu lực', async () => {
    const st = (await query("SELECT id, no_show_fee_dong::int fee, power_limit_w FROM stations WHERE name = 'Trạm Cầu Giấy'")).rows[0];
    assert.deepStrictEqual({ fee: st.fee, limit: st.power_limit_w }, { fee: 20000, limit: 30000 });
    const win = (await query('SELECT start_minute, end_minute, limit_w FROM station_power_windows WHERE station_id = $1 AND deleted_at IS NULL', [st.id])).rows;
    assert.deepStrictEqual(win, [{ start_minute: 1020, end_minute: 1200, limit_w: 15000 }]);
    const price = (await query('SELECT p.price_per_kwh_dong::int k FROM tariffs t JOIN tariff_periods p ON p.tariff_id = t.id WHERE t.station_id = $1 AND t.effective_from <= CURRENT_DATE', [st.id])).rows;
    assert.deepStrictEqual(price, [{ k: 3850 }]);
    const distinctFees = (await query('SELECT DISTINCT no_show_fee_dong::int f FROM stations ORDER BY f')).rows.map((r) => r.f);
    assert.ok(distinctFees.length > 1, 'phí không đến phải khác nhau giữa các trạm');
  });

  it('không còn tools/seed-demo.js; tài liệu và mã chỉ trỏ tới `npm run seed-demo`', () => {
    assert.ok(!fs.existsSync(path.join(repoRoot, 'tools/seed-demo.js')));
    for (const file of ['README.md', 'run.py', 'docs/guides/OPERATIONS.md', 'docs/demo/CHECKLIST-TRUOC-DEMO.md', 'docs/demo/KICH-BAN-DEMO.md', 'backend/.env.example']) {
      assert.ok(!fs.readFileSync(path.join(repoRoot, file), 'utf8').includes('tools/seed-demo.js'), `${file} còn trỏ tới tools/seed-demo.js`);
    }
  });
});

describe('C2: demo-smoke thất bại thì thoát mã khác 0', () => {
  const smoke = (extra) => spawnSync(process.execPath, [path.join(repoRoot, 'tools/demo-smoke.js')], {
    env: { ...process.env, ...extra }, encoding: 'utf8',
  });

  it('server không chạy: mọi nhóm FAIL, thoát 1', () => {
    const r = smoke({ APP_BASE_URL: 'http://127.0.0.1:1', DEMO_PASSWORD: 'DemoPass-2026-Ok' });
    assert.strictEqual(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /0\/6 NHÓM ĐẠT/);
  });

  it('thiếu hoặc ngắn DEMO_PASSWORD: dừng với thông báo rõ, thoát 1', () => {
    const r = smoke({ APP_BASE_URL: 'http://127.0.0.1:1', DEMO_PASSWORD: 'short' });
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /DEMO_PASSWORD.*12 ký tự/);
  });
});
