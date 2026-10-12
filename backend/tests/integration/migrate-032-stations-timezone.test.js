const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

const column = async () => (await query(
  "SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'stations' AND column_name = 'timezone'"
)).rows[0];

describe('migration 032: stations.timezone [GYM-57]', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('up: cột timezone TEXT NOT NULL mặc định Asia/Ho_Chi_Minh; trạm cũ nhận giá trị mặc định', async () => {
    const info = await column();
    assert.ok(info, 'Cột timezone phải tồn tại');
    assert.equal(info.data_type, 'text');
    assert.equal(info.is_nullable, 'NO');
    assert.match(info.column_default, /Asia\/Ho_Chi_Minh/);

    const ownerRes = await query("INSERT INTO users (name, email, password_hash) VALUES ('Owner', 'owner-tz@test.invalid', 'hash') RETURNING id");
    const ownerId = ownerRes.rows[0].id;

    const stRes = await query(
      "INSERT INTO stations (name, address, latitude, longitude, owner_id) VALUES ('Trạm Mẫu', 'Hà Nội', 21.0, 105.8, $1) RETURNING timezone",
      [ownerId]
    );
    assert.equal(stRes.rows[0].timezone, 'Asia/Ho_Chi_Minh');
  });

  it('down bỏ cột; up lại sạch', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0].version !== '032_stations_timezone.sql') {
      assert.strictEqual(run('src/db/migrate.js', ['down']).status, 0);
    }
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    assert.equal(await column(), undefined);

    assert.strictEqual(run('src/db/migrate.js').status, 0);
    assert.ok(await column());
  });
});
