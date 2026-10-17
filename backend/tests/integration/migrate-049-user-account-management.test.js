const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 049: user account activation status', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
  });

  after(resetSchema);

  it('defaults existing and new accounts to active', async () => {
    const column = await query(
      `SELECT is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_active'`
    );
    assert.deepStrictEqual(column.rows[0], { is_nullable: 'NO', column_default: 'true' });

    const user = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('Account Status', 'account-status-049@test.invalid', 'hash')
       RETURNING is_active`
    );
    assert.equal(user.rows[0].is_active, true);
  });

  it('rolls the account status column back and reapplies it', async () => {
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    const absent = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_active'`
    );
    assert.equal(absent.rowCount, 0);

    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_active'`
    );
    assert.equal(present.rowCount, 1);
  });
});
