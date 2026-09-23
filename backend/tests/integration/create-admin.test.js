const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { run, query, resetSchema } = require('../helpers/db');

const PASSWORD = 'CorrectHorse-Battery9';
const admin = { ADMIN_EMAIL: 'Owner@Example.com', ADMIN_PASSWORD: PASSWORD };

describe('S-01 create-admin', () => {
  before(async () => { await resetSchema(); assert.strictEqual(run('src/db/migrate.js').status, 0); });
  after(resetSchema);

  it('tạo 1 admin argon2id có role ADMIN, không in mật khẩu', async () => {
    const r = run('scripts/create-admin.js', [], admin);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes(PASSWORD) && !r.stderr.includes(PASSWORD));
    const u = await query("SELECT u.email, u.password_hash, r.code FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id");
    assert.strictEqual(u.rowCount, 1);
    assert.strictEqual(u.rows[0].email, 'owner@example.com');
    assert.strictEqual(u.rows[0].code, 'ADMIN');
    assert.ok(u.rows[0].password_hash.startsWith('$argon2id$'));
  });

  it('chạy lại không tạo trùng', async () => {
    const r = run('scripts/create-admin.js', [], admin);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual((await query('SELECT count(*)::int AS n FROM users')).rows[0].n, 1);
  });

  it('mật khẩu < 12 ký tự hoặc thiếu env → thoát mã 1', () => {
    assert.strictEqual(run('scripts/create-admin.js', [], { ADMIN_EMAIL: 'a@b.co', ADMIN_PASSWORD: 'short' }).status, 1);
    assert.strictEqual(run('scripts/create-admin.js', [], {}).status, 1);
  });
});
