const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const table = async () => (await query("SELECT to_regclass('public.ocpp_messages') AS t")).rows[0].t;

describe('migration 015: ocpp_messages', () => {
  let chargePoint;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    const owner = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Migration owner', 'migration-ocpp@test.invalid', 'unused') RETURNING id"
    );
    const station = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('Migration station', 'test', $1) RETURNING id",
      [owner.rows[0].id]
    );
    chargePoint = (await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'MIGRATION-CP') RETURNING id",
      [station.rows[0].id]
    )).rows[0];
  });
  after(resetSchema);

  it('up: khoá (charge_point_id, message_id), phản hồi JSONB, chỉ mục created_at', async () => {
    assert.ok(await table());
    await query("INSERT INTO ocpp_messages (charge_point_id, message_id, action, payload_hash, response) VALUES ($1, 'm1', 'Heartbeat', 'h', '{\"a\":1}')", [chargePoint.id]);
    await assert.rejects(query("INSERT INTO ocpp_messages (charge_point_id, message_id, action, payload_hash, response) VALUES ($1, 'm1', 'Heartbeat', 'h', '{}')", [chargePoint.id]), /duplicate key/);
    assert.equal((await query("SELECT charge_point_id FROM ocpp_messages WHERE message_id = 'm1'")).rows[0].charge_point_id, String(chargePoint.id));
    const idx = await query("SELECT indexdef FROM pg_indexes WHERE tablename = 'ocpp_messages' AND indexdef ILIKE '%created_at%'");
    assert.equal(idx.rowCount, 1);
  });

  it('down/up đổi khoá ngược lại được; rollback migration tạo bảng xoá bảng', async () => {
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal((await query("SELECT column_name FROM information_schema.columns WHERE table_name = 'ocpp_messages' AND column_name = 'charge_point_code'")).rowCount, 1);
    assert.equal((await query("SELECT charge_point_code FROM ocpp_messages WHERE message_id = 'm1'")).rows[0].charge_point_code, 'MIGRATION-CP');
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    assert.equal((await query("SELECT charge_point_id FROM ocpp_messages WHERE message_id = 'm1'")).rows[0].charge_point_id, String(chargePoint.id));
    assert.strictEqual(run('src/db/migrate.js', ['down']).status, 0);
    const dropTable = run('src/db/migrate.js', ['down']);
    assert.strictEqual(dropTable.status, 0, dropTable.stderr);
    assert.equal(await table(), null);
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    assert.ok(await table());
  });
});
