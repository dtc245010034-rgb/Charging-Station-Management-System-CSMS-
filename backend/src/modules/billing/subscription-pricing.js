function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function getStationRate(stationTariff) {
  if (!stationTariff) return 0;
  if (Array.isArray(stationTariff)) {
    const first = stationTariff[0];
    if (!first) return 0;
    return asNumber(pickFirst(
      first.pricePerKwh,
      first.price_per_kwh,
      first.pricePerKwhDong,
      first.price_per_kwh_dong,
      first.ratePerKwh,
      0,
    ), 0);
  }

  if (typeof stationTariff === 'object') {
    return asNumber(pickFirst(
      stationTariff.pricePerKwh,
      stationTariff.price_per_kwh,
      stationTariff.pricePerKwhDong,
      stationTariff.price_per_kwh_dong,
      stationTariff.ratePerKwh,
      stationTariff.defaultPricePerKwh,
      0,
    ), 0);
  }

  return asNumber(stationTariff, 0);
}

function isActiveSubscription(subscription, now = new Date()) {
  if (!subscription || typeof subscription !== 'object') return false;

  const status = String(pickFirst(subscription.status, 'ACTIVE') || 'ACTIVE').toUpperCase();
  if (status === 'EXPIRED' || status === 'CANCELLED' || status === 'CANCELED') {
    return false;
  }

  const currentTime = asDate(now) ?? new Date();
  const startsAt = asDate(pickFirst(subscription.startsAt, subscription.starts_at, subscription.startAt, subscription.validFrom));
  const expiresAt = asDate(pickFirst(subscription.expiresAt, subscription.expires_at, subscription.expiryAt, subscription.validTo));

  if (startsAt && currentTime < startsAt) return false;
  if (expiresAt && currentTime > expiresAt) return false;
  return true;
}

function getSubscriptionRate(subscription) {
  if (!subscription || typeof subscription !== 'object') return 0;
  const packageRate = pickFirst(
    subscription.pricePerKwh,
    subscription.price_per_kwh,
    subscription.pricePerKwhDong,
    subscription.price_per_kwh_dong,
    subscription.ratePerKwh,
    0,
  );
  return asNumber(packageRate, 0);
}

function resolveEffectiveRate({ stationTariff = null, subscription = null, now = new Date() } = {}) {
  const stationRate = getStationRate(stationTariff);
  const active = isActiveSubscription(subscription, now);

  if (!active) {
    return {
      source: 'STATION',
      effectiveRate: stationRate,
      packageId: null,
      packageLabel: null,
      subscription: null,
    };
  }

  const packageRate = getSubscriptionRate(subscription);
  const packageId = pickFirst(subscription.id, subscription.planId, subscription.packageId, subscription.subscriptionId, null);
  const packageLabel = pickFirst(subscription.label, subscription.name, subscription.packageName, subscription.planName, null);

  return {
    source: 'SUBSCRIPTION',
    effectiveRate: packageRate > 0 ? packageRate : stationRate,
    packageId,
    packageLabel,
    subscription,
  };
}

function buildInvoiceSummary({ stationTariff = null, subscription = null, now = new Date() } = {}) {
  const resolved = resolveEffectiveRate({ stationTariff, subscription, now });
  return {
    billingSource: resolved.source,
    activePackageId: resolved.packageId ?? null,
    packageLabel: resolved.packageLabel ?? null,
    unitPriceDong: resolved.effectiveRate,
    sourceRateDong: resolved.effectiveRate,
  };
}

module.exports = {
  resolveEffectiveRate,
  buildInvoiceSummary,
  getStationRate,
  getSubscriptionRate,
  isActiveSubscription,
};
