const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const table = async () => (await query("SELECT to_regclass('public.id_tags') AS t")).rows[0].t;

describe('migration 016: id_tags', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: bảng id_tags có tag unique, status ACTIVE/BLOCKED, index tag và user_id', async () => {
    assert.ok(await table());
    await query("INSERT INTO id_tags (tag, status) VALUES ('TAG-01', 'ACTIVE')");
    await assert.rejects(query("INSERT INTO id_tags (tag, status) VALUES ('TAG-01', 'ACTIVE')"), /duplicate key/);
    await query("INSERT INTO id_tags (tag, status) VALUES ('TAG-02', 'BLOCKED')");
    await assert.rejects(query("INSERT INTO id_tags (tag, status) VALUES ('TAG-03', 'INVALID_STATUS')"), /check constraint/);

    const idx = await query("SELECT indexname FROM pg_indexes WHERE tablename = 'id_tags'");
    const names = idx.rows.map((r) => r.indexname);
    assert.ok(names.includes('id_tags_tag_key'));
    assert.ok(names.includes('idx_id_tags_user_id'));
  });

  it('down xoá bảng; up lại sạch', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0].version !== '016_id_tags.sql') {
      assert.strictEqual(run('src/db/migrate.js', ['down']).status, 0);
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal(await table(), null);
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    assert.ok(await table());
  });
});
