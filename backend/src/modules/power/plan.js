function normalizeTimeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = /^([0-1]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeScheduleItems(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((slot) => slot && typeof slot === 'object')
    .map((slot) => ({
      start: typeof slot.start === 'string' ? slot.start : '00:00',
      end: typeof slot.end === 'string' ? slot.end : '23:59',
      maxKw: asNumber(slot.maxKw, 0),
    }))
    .filter((slot) => slot.maxKw >= 0)
    .map((slot) => ({
      ...slot,
      startMinutes: normalizeTimeToMinutes(slot.start) ?? 0,
      endMinutes: normalizeTimeToMinutes(slot.end) ?? 1439,
    }));
}

function getCurrentMinutes(date, timezone) {
  if (timezone) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  }
  return date.getHours() * 60 + date.getMinutes();
}

function resolvePowerLimit(station, date = new Date()) {
  const wattLimit = station?.power_limit_w ?? station?.powerLimitW ?? null;
  const baseLimit = asNumber(
    station?.power_limit_kw ?? station?.powerCapKw ?? (wattLimit == null ? 0 : wattLimit / 1000),
    0,
  );
  const schedule = normalizeScheduleItems(station?.power_profile ?? station?.powerProfile ?? []);
  if (!schedule.length) return baseLimit;

  const currentMinutes = getCurrentMinutes(date, station?.timezone);
  const activeSlot = schedule.find((slot) => {
    const start = slot.startMinutes;
    const end = slot.endMinutes;
    if (start < end) return currentMinutes >= start && currentMinutes < end;
    return currentMinutes >= start || currentMinutes < end;
  }) || schedule[0];

  if (!activeSlot) return baseLimit;
  return Math.min(baseLimit, activeSlot.maxKw || baseLimit);
}

function rebalanceCapacity({ stationLimitKw, activeSessions = [] }) {
  const limit = Math.max(0, asNumber(stationLimitKw, 0));
  const sessions = Array.isArray(activeSessions) ? activeSessions : [];
  if (!sessions.length || limit <= 0) {
    return { totalLimitKw: 0, sessions: [] };
  }

  let runningTotal = 0;
  const results = sessions.map((session, index) => {
    const raw = limit / sessions.length;
    let limitKw = Number((Math.floor((raw + Number.EPSILON) * 100) / 100).toFixed(2));
    if (index === sessions.length - 1) {
      limitKw = Number((limit - runningTotal).toFixed(2));
    }
    runningTotal += limitKw;
    return { id: session.id ?? index, session, limitKw };
  });

  return {
    totalLimitKw: Number(limit.toFixed(2)),
    sessions: results,
  };
}

module.exports = { normalizeScheduleItems, resolvePowerLimit, rebalanceCapacity };
