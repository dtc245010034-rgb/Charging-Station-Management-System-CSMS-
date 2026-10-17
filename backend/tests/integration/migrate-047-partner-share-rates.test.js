const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 047: partner_share_rates append-only table', () => {
  let ownerId;
  let adminId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);

    const owner = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Station Owner A', 'owner-a-m047@test.invalid', 'hash') RETURNING id"
    );
    ownerId = owner.rows[0].id;

    const admin = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Admin User', 'admin-m047@test.invalid', 'hash') RETURNING id"
    );
    adminId = admin.rows[0].id;
  });

  after(resetSchema);

  it('tạo bảng partner_share_rates với đúng schema và cho phép chèn bản ghi', async () => {
    const res = await query(
      `INSERT INTO partner_share_rates (owner_id, share_bp, include_idle, effective_from, created_by, note)
       VALUES ($1, 7000, TRUE, '2026-01-01', $2, 'Hợp đồng ban đầu')
       RETURNING id, owner_id, share_bp, include_idle, effective_from, created_by, created_at, note`,
      [ownerId, adminId]
    );

    assert.equal(res.rowCount, 1);
    const row = res.rows[0];
    assert.equal(row.owner_id, ownerId);
    assert.equal(row.share_bp, 7000);
    assert.equal(row.include_idle, true);
    assert.equal(row.note, 'Hợp đồng ban đầu');
    assert.ok(row.created_at);
  });

  it('chặn share_bp ngoài khoảng 0 đến 10000', async () => {
    await assert.rejects(
      query(
        "INSERT INTO partner_share_rates (owner_id, share_bp, effective_from) VALUES ($1, -1, '2026-02-01')",
        [ownerId]
      ),
      (error) => error.code === '23514' // check_violation
    );

    await assert.rejects(
      query(
        "INSERT INTO partner_share_rates (owner_id, share_bp, effective_from) VALUES ($1, 10001, '2026-02-01')",
        [ownerId]
      ),
      (error) => error.code === '23514'
    );
  });

  it('chặn trùng (owner_id, effective_from)', async () => {
    await assert.rejects(
      query(
        "INSERT INTO partner_share_rates (owner_id, share_bp, effective_from) VALUES ($1, 7500, '2026-01-01')",
        [ownerId]
      ),
      (error) => error.code === '23505' // unique_violation
    );
  });

  it('chặn UPDATE, DELETE và TRUNCATE bằng trigger chỉ-ghi-thêm (55000)', async () => {
    await assert.rejects(
      query("UPDATE partner_share_rates SET share_bp = 8000 WHERE owner_id = $1", [ownerId]),
      (error) => error.code === '55000' && error.message.includes('append-only')
    );

    await assert.rejects(
      query("DELETE FROM partner_share_rates WHERE owner_id = $1", [ownerId]),
      (error) => error.code === '55000' && error.message.includes('append-only')
    );

    await assert.rejects(
      query("TRUNCATE TABLE partner_share_rates"),
      (error) => error.code === '55000' && error.message.includes('append-only')
    );
  });

  it('migration 047 rollback và migrate lại thành công', async () => {
    const down = run('src/db/migrate.js', ['down']);
    assert.strictEqual(down.status, 0, down.stderr);
    const absent = await query("SELECT to_regclass('public.partner_share_rates') AS table_name");
    assert.equal(absent.rows[0].table_name, null);

    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);
    const present = await query("SELECT to_regclass('public.partner_share_rates') AS table_name");
    assert.equal(present.rows[0].table_name, 'partner_share_rates');
  });
});
