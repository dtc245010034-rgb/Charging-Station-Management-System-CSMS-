const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const users = require('../../src/modules/users/users.repository');

describe('users.repository.roleCodesOf: thứ tự vai trò ổn định', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
  });

  after(async () => {
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('trả vai trò theo id vai trò tăng dần, không phụ thuộc thứ tự gán', async () => {
    const roles = (await query('SELECT id, code FROM roles ORDER BY id')).rows;
    assert.ok(roles.length >= 2);
    const user = (await query("INSERT INTO users (name, email, password_hash) VALUES ('u', 'order@test.invalid', 'x') RETURNING id")).rows[0];
    for (const role of [...roles].reverse()) await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [user.id, role.id]);
    assert.deepEqual(await users.roleCodesOf(user.id), roles.map((role) => role.code));
  });

  it('câu truy vấn có ORDER BY tường minh (thứ tự hàng của Postgres không được bảo đảm nếu thiếu)', async () => {
    const { pool } = require('../../src/db/pool');
    const original = pool.query.bind(pool);
    const seen = [];
    pool.query = (text, ...rest) => { seen.push(String(text)); return original(text, ...rest); };
    try {
      await users.roleCodesOf(1);
    } finally {
      pool.query = original;
    }
    assert.match(seen.join('\n'), /ORDER BY\s+r\.id/i);
  });
});
