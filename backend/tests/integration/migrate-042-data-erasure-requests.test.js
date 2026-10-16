const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 042: data erasure requests [GYM-83]', () => {
  let driverId;
  let adminId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
    const users = await query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('Erasure Driver', 'm042-driver@test.invalid', 'hash'),
              ('Erasure Admin', 'm042-admin@test.invalid', 'hash')
       RETURNING id, email`
    );
    driverId = users.rows.find((user) => user.email === 'm042-driver@test.invalid').id;
    adminId = users.rows.find((user) => user.email === 'm042-admin@test.invalid').id;
  });
  after(resetSchema);

  it('S-57 AC: allows one open request and stores only count-shaped result metadata', async () => {
    const created = await query(
      "INSERT INTO data_erasure_requests (driver_id) VALUES ($1) RETURNING id, status",
      [driverId]
    );
    assert.strictEqual(created.rows[0].status, 'REQUESTED');
    await assert.rejects(
      query('INSERT INTO data_erasure_requests (driver_id) VALUES ($1)', [driverId]),
      (error) => error.code === '23505'
    );
    await query(
      `UPDATE data_erasure_requests
       SET status = 'COMPLETED', decided_by = $2, result = '{"sessions":3,"invoices":3,"idTags":1,"notifications":2,"emails":1}'
       WHERE id = $1`,
      [created.rows[0].id, adminId]
    );
    await assert.rejects(
      query(
        `UPDATE data_erasure_requests SET result = '{"sessions":3,"email":"person@example.invalid"}' WHERE id = $1`,
        [created.rows[0].id]
      ),
      (error) => error.code === '23514'
    );
    const reopened = await query(
      "INSERT INTO data_erasure_requests (driver_id) VALUES ($1) RETURNING id",
      [driverId]
    );
    assert.ok(reopened.rows[0].id);
  });

  it('migration 042 rolls back and reapplies', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0]?.version !== '042_data_erasure_requests.sql') {
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    const absent = await query("SELECT to_regclass('public.data_erasure_requests') AS table_name");
    assert.strictEqual(absent.rows[0].table_name, null);
    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query("SELECT to_regclass('public.data_erasure_requests') AS table_name");
    assert.ok(present.rows[0].table_name);
  });
});
