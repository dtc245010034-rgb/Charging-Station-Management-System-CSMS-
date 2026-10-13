const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { BASE, run, query, resetSchema } = require('../helpers/db');
process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || BASE;
process.env.JWT_SECRET ||= 'z'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';
const { findEffectiveTariff } = require('../../src/modules/billing/tariffs.repository');

async function createStation({ name, email, timezone }) {
  const owner = await query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [`Owner ${name}`, email, 'hash']
  );
  const station = await query(
    `INSERT INTO stations (name, address, latitude, longitude, owner_id, timezone)
     VALUES ($1, 'HN', 21, 105, $2, $3) RETURNING id`,
    [name, owner.rows[0].id, timezone]
  );
  return station.rows[0].id;
}

async function addTariff(stationId, version, effectiveFrom, pricePerKwh) {
  const tariff = await query(
    'INSERT INTO tariffs (station_id, version, effective_from) VALUES ($1, $2, $3) RETURNING id',
    [stationId, version, effectiveFrom]
  );
  await query(
    `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong)
     VALUES ($1, 0, 1440, $2)`,
    [tariff.rows[0].id, pricePerKwh]
  );
}

describe('findEffectiveTariff [GYM-60]', () => {
  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
  });
  after(resetSchema);

  it('chọn biểu giá có hiệu lực tại ngày địa phương của started_at', async () => {
    const stationId = await createStation({
      name: 'Tariff Date HCM',
      email: 'tariff-date-hcm@test.invalid',
      timezone: 'Asia/Ho_Chi_Minh',
    });
    await addTariff(stationId, 1, '2026-10-20', 4000);
    await addTariff(stationId, 2, '2026-10-21', 5000);

    const beforeMidnight = await findEffectiveTariff(
      { query },
      stationId,
      '2026-10-20T16:00:00Z'
    );
    assert.equal(beforeMidnight.version, 1);
    assert.equal(beforeMidnight.periods[0].pricePerKwh, '4000');

    const afterMidnight = await findEffectiveTariff(
      { query },
      stationId,
      '2026-10-20T17:00:00Z'
    );
    assert.equal(afterMidnight.version, 2);
    assert.equal(afterMidnight.periods[0].pricePerKwh, '5000');
  });

  it('tính ngày hiệu lực theo múi giờ Asia/Kolkata và trả null khi chưa có biểu giá', async () => {
    const stationId = await createStation({
      name: 'Tariff Date Kolkata',
      email: 'tariff-date-kolkata@test.invalid',
      timezone: 'Asia/Kolkata',
    });
    await addTariff(stationId, 1, '2026-10-20', 4000);
    await addTariff(stationId, 2, '2026-10-21', 5000);

    const localNextDay = await findEffectiveTariff(
      { query },
      stationId,
      '2026-10-20T19:00:00Z'
    );
    assert.equal(localNextDay.version, 2);

    const otherStationId = await createStation({
      name: 'Tariff Date Empty',
      email: 'tariff-date-empty@test.invalid',
      timezone: 'Asia/Kolkata',
    });
    assert.equal(
      await findEffectiveTariff({ query }, otherStationId, '2026-10-20T19:00:00Z'),
      null
    );
  });
});
