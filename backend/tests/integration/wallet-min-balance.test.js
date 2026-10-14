process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET ||= 'z'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { getMinBalanceDong } = require('../../src/modules/wallet/min-balance.service');
const { query, resetSchema, run } = require('../helpers/db');

async function createStation(code) {
  const owner = await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    ['Test Owner', `${code.toLowerCase()}@wallet-min.test`, 'hash']
  );
  const station = await query(
    `INSERT INTO stations (name, address, latitude, longitude, owner_id, timezone)
     VALUES ($1, 'Test address', 21, 105, $2, 'Asia/Ho_Chi_Minh') RETURNING id`,
    [code, owner.rows[0].id]
  );
  return station.rows[0].id;
}

async function createTariff(stationId, version, effectiveFrom, prices) {
  const tariff = await query(
    `INSERT INTO tariffs (station_id, version, effective_from)
     VALUES ($1, $2, $3::date) RETURNING id`,
    [stationId, version, effectiveFrom]
  );
  for (const [index, price] of prices.entries()) {
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong)
       VALUES ($1, $2, $3, $4)`,
      [tariff.rows[0].id, index * 720, (index + 1) * 720, price]
    );
  }
}

describe('S-38 dynamic wallet minimum balance', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
  });
  after(resetSchema);

  it('explicit WALLET_MIN_BALANCE_DONG overrides tariff prices', async () => {
    let queried = false;
    const threshold = await getMinBalanceDong({
      query: async () => {
        queried = true;
        throw new Error('tariffs should not be queried for explicit threshold');
      },
    }, 250000);

    assert.equal(threshold, 250000n);
    assert.equal(queried, false);
  });

  it('empty threshold is five kWh at the highest currently effective tariff', async () => {
    const stationOne = await createStation(`MIN-A-${Date.now()}`);
    const stationTwo = await createStation(`MIN-B-${Date.now()}`);
    await createTariff(stationOne, 1, '2026-10-13', [900000]);
    await createTariff(stationOne, 2, '2026-10-14', [2000, 4000]);
    await createTariff(stationOne, 3, '2026-10-15', [999999]);
    await createTariff(stationTwo, 1, '2026-10-14', [3500]);

    const threshold = await getMinBalanceDong(
      { query },
      null,
      '2026-10-14T12:00:00+07:00'
    );

    assert.equal(threshold, 20000n);
  });

  it('caches the calculated threshold for 60 seconds', async () => {
    let calls = 0;
    const db = {
      query: async () => {
        calls += 1;
        return { rows: [{ max_price_per_kwh_dong: '4000' }] };
      },
    };
    const originalNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      const first = await getMinBalanceDong(db, null, '2026-10-14T12:00:00+07:00');
      now += 59999;
      const second = await getMinBalanceDong(db, null, '2026-10-14T12:00:00+07:00');
      now += 1;
      const third = await getMinBalanceDong(db, null, '2026-10-14T12:00:00+07:00');

      assert.deepEqual([first, second, third], [20000n, 20000n, 20000n]);
      assert.equal(calls, 2);
    } finally {
      Date.now = originalNow;
    }
  });

  it('uses a zero threshold when no current tariff exists', async () => {
    const threshold = await getMinBalanceDong({
      query: async () => ({ rows: [{ max_price_per_kwh_dong: null }] }),
    }, null, '2026-10-14T12:00:00+07:00');

    assert.equal(threshold, 0n);
  });
});
