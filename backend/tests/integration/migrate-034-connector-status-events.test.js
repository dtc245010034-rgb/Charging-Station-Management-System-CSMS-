const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const tableExists = async () => (await query(
  "SELECT 1 FROM information_schema.tables WHERE table_name = 'connector_status_events'"
)).rowCount === 1;

const indexExists = async () => (await query(
  "SELECT 1 FROM pg_indexes WHERE indexname = 'idx_connector_status_events_conn_occurred'"
)).rowCount === 1;

describe('migration 034: connector_status_events [GYM-54]', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: bảng connector_status_events và chỉ mục tồn tại', async () => {
    assert.ok(await tableExists(), 'Bảng connector_status_events phải tồn tại');
    assert.ok(await indexExists(), 'Chỉ mục idx_connector_status_events_conn_occurred phải tồn tại');
  });

  it('down xoá bảng; up lại sạch', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0].version !== '034_connector_status_events.sql') {
      assert.strictEqual(run('src/db/migrate.js', ['down']).status, 0);
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal(await tableExists(), false);
    assert.equal(await indexExists(), false);

    assert.strictEqual(run('src/db/migrate.js').status, 0);
    assert.ok(await tableExists());
    assert.ok(await indexExists());
  });
});
