const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const column = async () => (await query("SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'token_version'")).rows[0];

describe('migration 014: users.token_version', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: cột INTEGER NOT NULL mặc định 0; dòng cũ nhận 0', async () => {
    const info = await column();
    assert.equal(info.data_type, 'integer');
    assert.equal(info.is_nullable, 'NO');
    assert.match(info.column_default, /^0/);
    await query("INSERT INTO users (name, email, password_hash) VALUES ('u', 'm014@test.invalid', 'x')");
    assert.equal((await query("SELECT token_version FROM users WHERE email = 'm014@test.invalid'")).rows[0].token_version, 0);
  });

  it('down bỏ cột; up lại sạch', async () => {
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal(await column(), undefined);
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    assert.ok(await column());
  });
});
