const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 047: partner share rates are append-only', () => {
  let ownerId;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
    const owner = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Rate Owner', 'rate-owner-047@test.invalid', 'hash') RETURNING id"
    );
    ownerId = owner.rows[0].id;
  });

  after(resetSchema);

  it('stores bounded rates with an inclusive effective date and a true idle default', async () => {
    const inserted = await query(
      `INSERT INTO partner_share_rates (owner_id, share_bp, effective_from)
       VALUES ($1, 7000, '2026-01-01') RETURNING share_bp, include_idle, effective_from`,
      [ownerId]
    );
    assert.deepStrictEqual(inserted.rows[0], {
      share_bp: 7000,
      include_idle: true,
      effective_from: new Date('2026-01-01T00:00:00.000Z'),
    });

    await assert.rejects(
      query(
        `INSERT INTO partner_share_rates (owner_id, share_bp, effective_from)
         VALUES ($1, 10001, '2026-02-01')`,
        [ownerId]
      ),
      (error) => error.code === '23514'
    );
    await assert.rejects(
      query(
        `INSERT INTO partner_share_rates (owner_id, share_bp, effective_from)
         VALUES ($1, -1, '2026-03-01')`,
        [ownerId]
      ),
      (error) => error.code === '23514'
    );
    await assert.rejects(
      query(
        `INSERT INTO partner_share_rates (owner_id, share_bp, effective_from)
         VALUES ($1, 7500, '2026-01-01')`,
        [ownerId]
      ),
      (error) => error.code === '23505'
    );
  });

  it('rejects UPDATE, DELETE, and TRUNCATE', async () => {
    const rate = await query(
      `INSERT INTO partner_share_rates (owner_id, share_bp, effective_from)
       VALUES ($1, 6000, '2026-02-01') RETURNING id`,
      [ownerId]
    );
    await assert.rejects(
      query('UPDATE partner_share_rates SET share_bp = 6500 WHERE id = $1', [rate.rows[0].id]),
      /append-only/
    );
    await assert.rejects(
      query('DELETE FROM partner_share_rates WHERE id = $1', [rate.rows[0].id]),
      /append-only/
    );
    await assert.rejects(query('TRUNCATE partner_share_rates'), /append-only/);
  });

  it('rolls migration 047 back and reapplies it', async () => {
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
