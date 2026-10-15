const { BadRequestError } = require('../../lib/errors');

const MINIMUM_BALANCE_KWH = 5n;
const CACHE_TTL_MS = 60_000;
const dynamicThresholdCache = new WeakMap();

async function getMinBalanceDong(db, configuredBalance = require('../../config/env').WALLET_MIN_BALANCE_DONG, now = new Date()) {
  if (configuredBalance !== undefined && configuredBalance !== null) {
    if (!Number.isSafeInteger(configuredBalance) || configuredBalance < 0) {
      throw new BadRequestError('WALLET_MIN_BALANCE_DONG phải là số nguyên không âm');
    }
    return BigInt(configuredBalance);
  }

  const cached = dynamicThresholdCache.get(db);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const tariffResult = await db.query(
    `SELECT MAX(tp.price_per_kwh_dong)::text AS max_price_per_kwh_dong
     FROM stations s
     JOIN tariffs t ON t.station_id = s.id
     JOIN tariff_periods tp ON tp.tariff_id = t.id
     WHERE t.effective_from <= (($1::timestamptz AT TIME ZONE s.timezone)::date)
       AND NOT EXISTS (
         SELECT 1
         FROM tariffs newer
         WHERE newer.station_id = t.station_id
           AND newer.effective_from <= (($1::timestamptz AT TIME ZONE s.timezone)::date)
           AND newer.effective_from > t.effective_from
       )`,
    [now]
  );
  const highestPrice = tariffResult.rows[0]?.max_price_per_kwh_dong;
  const value = highestPrice == null
    ? 0n
    : BigInt(highestPrice) * MINIMUM_BALANCE_KWH;

  dynamicThresholdCache.set(db, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

module.exports = { getMinBalanceDong };
