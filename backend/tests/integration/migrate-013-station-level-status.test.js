const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const hasColumn = async (table, column) => (await query('SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [table, column])).rowCount === 1;
const isNullable = async (table, column) => (await query('SELECT is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [table, column])).rows[0].is_nullable === 'YES';

describe('migration 013: trạng thái mức trụ', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: cột mới ở charge_points, connector_id nullable, charge_point_id + CHECK đúng một đích', async () => {
    for (const column of ['ocpp_status', 'last_error_code', 'status_updated_at']) assert.ok(await hasColumn('charge_points', column), column);
    assert.ok(await hasColumn('connector_errors', 'charge_point_id'));
    assert.ok(await isNullable('connector_errors', 'connector_id'));

    const user = (await query("INSERT INTO users (name, email, password_hash) VALUES ('u', 'm013@test.invalid', 'x') RETURNING id")).rows[0].id;
    const station = (await query("INSERT INTO stations (name, address, owner_id) VALUES ('s', 'a', $1) RETURNING id", [user])).rows[0].id;
    const cp = (await query("INSERT INTO charge_points (station_id, code) VALUES ($1, 'M013-CP') RETURNING id", [station])).rows[0].id;
    const connector = (await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id', [cp])).rows[0].id;

    await query("INSERT INTO connector_errors (charge_point_id, error_code) VALUES ($1, 'GroundFailure')", [cp]);
    await query("INSERT INTO connector_errors (connector_id, error_code) VALUES ($1, 'GroundFailure')", [connector]);
    await assert.rejects(query("INSERT INTO connector_errors (error_code) VALUES ('GroundFailure')"), /connector_errors_target_chk/);
    await assert.rejects(query("INSERT INTO connector_errors (connector_id, charge_point_id, error_code) VALUES ($1, $2, 'GroundFailure')", [connector, cp]), /connector_errors_target_chk/);
  });

  it('down xoá dòng lỗi mức trụ, trả connector_id về NOT NULL, bỏ cột; up lại sạch', async () => {
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.ok(!await hasColumn('connector_errors', 'charge_point_id'));
    assert.ok(!await hasColumn('charge_points', 'last_error_code'));
    assert.ok(!await isNullable('connector_errors', 'connector_id'));
    assert.equal((await query('SELECT count(*)::int AS n FROM connector_errors')).rows[0].n, 1);
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    assert.ok(await hasColumn('connector_errors', 'charge_point_id'));
  });
});
