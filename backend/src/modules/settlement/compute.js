const { roundHalfUp } = require('../billing/money');

function dateOnly(value, field) {
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError(`${field} must be a YYYY-MM-DD date`);
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new TypeError(`${field} must be a valid date`);
  }
  return date;
}

function monthRange(month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new TypeError('month must be a YYYY-MM month');
  }
  const fromDate = `${month}-01`;
  const monthStart = new Date(`${fromDate}T00:00:00.000Z`);
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
  return { fromDate, toDate: monthEnd.toISOString().slice(0, 10) };
}

function addDays(date, count) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function computeSettlement({ month, invoices, rates }) {
  const range = monthRange(month);
  if (!Array.isArray(invoices) || !Array.isArray(rates)) {
    throw new TypeError('invoices and rates must be arrays');
  }

  const ratesByOwner = new Map();
  for (const rate of rates) {
    const ownerId = String(rate.ownerId);
    const effectiveFrom = dateOnly(rate.effectiveFrom, 'effectiveFrom');
    if (!Number.isSafeInteger(rate.shareBp) || rate.shareBp < 0 || rate.shareBp > 10000) {
      throw new RangeError('shareBp must be an integer between 0 and 10000');
    }
    if (typeof rate.includeIdle !== 'boolean') throw new TypeError('includeIdle must be a boolean');
    const ownerRates = ratesByOwner.get(ownerId) ?? [];
    ownerRates.push({ ...rate, ownerId, effectiveFrom, id: String(rate.id) });
    ratesByOwner.set(ownerId, ownerRates);
  }
  for (const ownerRates of ratesByOwner.values()) {
    ownerRates.sort((left, right) => compareText(left.effectiveFrom, right.effectiveFrom));
  }

  const segments = new Map();
  const missing = new Map();
  for (const invoice of invoices) {
    const periodDate = dateOnly(invoice.periodDate, 'periodDate');
    if (periodDate < range.fromDate || periodDate > range.toDate) continue;
    const ownerId = String(invoice.ownerId);
    const effectiveRate = (ratesByOwner.get(ownerId) ?? [])
      .filter((rate) => rate.effectiveFrom <= periodDate)
      .at(-1);
    if (!effectiveRate) {
      missing.set(`${ownerId}:${periodDate}`, { ownerId, periodDate });
      continue;
    }

    const key = `${ownerId}:${effectiveRate.id}`;
    let segment = segments.get(key);
    if (!segment) {
      const ownerRates = ratesByOwner.get(ownerId);
      const nextRate = ownerRates.find((rate) => rate.effectiveFrom > effectiveRate.effectiveFrom);
      const segmentStart = effectiveRate.effectiveFrom < range.fromDate
        ? range.fromDate
        : effectiveRate.effectiveFrom;
      const nextStart = nextRate?.effectiveFrom;
      const segmentEnd = nextStart && nextStart <= range.toDate
        ? addDays(nextStart, -1)
        : range.toDate;
      segment = {
        ownerId,
        rateId: effectiveRate.id,
        shareBp: effectiveRate.shareBp,
        includeIdle: effectiveRate.includeIdle,
        fromDate: segmentStart,
        toDate: segmentEnd,
        sessions: 0,
        energy: 0n,
        idle: 0n,
      };
      segments.set(key, segment);
    }
    segment.sessions += 1;
    segment.energy += BigInt(invoice.energyDong);
    segment.idle += BigInt(invoice.idleDong);
  }

  const lines = [...segments.values()]
    .sort((left, right) => compareText(left.ownerId, right.ownerId) || compareText(left.fromDate, right.fromDate))
    .map((segment) => {
      const base = segment.energy + (segment.includeIdle ? segment.idle : 0n);
      const share = BigInt(roundHalfUp(base * BigInt(segment.shareBp), 10000n));
      const revenue = segment.energy + segment.idle;
      return {
        ownerId: segment.ownerId,
        rateId: segment.rateId,
        shareBp: segment.shareBp,
        includeIdle: segment.includeIdle,
        fromDate: segment.fromDate,
        toDate: segment.toDate,
        sessions: segment.sessions,
        energyDong: segment.energy.toString(),
        idleDong: segment.idle.toString(),
        baseDong: base.toString(),
        shareDong: share.toString(),
        platformDong: (revenue - share).toString(),
      };
    });

  const totals = lines.reduce((sum, line) => ({
    revenue: sum.revenue + BigInt(line.energyDong) + BigInt(line.idleDong),
    share: sum.share + BigInt(line.shareDong),
    platform: sum.platform + BigInt(line.platformDong),
  }), { revenue: 0n, share: 0n, platform: 0n });

  return {
    lines,
    missingRates: [...missing.values()].sort((left, right) => (
      compareText(left.ownerId, right.ownerId) || compareText(left.periodDate, right.periodDate)
    )),
    totals: {
      revenueDong: totals.revenue.toString(),
      shareDong: totals.share.toString(),
      platformDong: totals.platform.toString(),
    },
  };
}

module.exports = { computeSettlement };
