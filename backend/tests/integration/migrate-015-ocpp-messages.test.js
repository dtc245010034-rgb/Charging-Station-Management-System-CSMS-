const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const table = async () => (await query("SELECT to_regclass('public.ocpp_messages') AS t")).rows[0].t;

describe('migration 015: ocpp_messages', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: khoá (charge_point_code, message_id), phản hồi JSONB, chỉ mục created_at', async () => {
    assert.ok(await table());
    await query("INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, response) VALUES ('CP-1', 'm1', 'Heartbeat', 'h', '{\"a\":1}')");
    await assert.rejects(query("INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, response) VALUES ('CP-1', 'm1', 'Heartbeat', 'h', '{}')"), /duplicate key/);
    await query("INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, response) VALUES ('CP-2', 'm1', 'Heartbeat', 'h', '{}')");
    const idx = await query("SELECT indexdef FROM pg_indexes WHERE tablename = 'ocpp_messages' AND indexdef ILIKE '%created_at%'");
    assert.equal(idx.rowCount, 1);
  });

  it('down xoá bảng; up lại sạch', async () => {
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal(await table(), null);
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    assert.ok(await table());
  });
});
