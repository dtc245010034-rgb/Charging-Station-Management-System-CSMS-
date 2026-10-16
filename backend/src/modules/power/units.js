const MIN_POWER_W = 100;
const MAX_POWER_W = 100000000;

function kilowattsToWatts(value) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value)
    : typeof value === 'string' ? value.trim()
      : '';
  const match = /^(\d+)(?:\.(\d))?$/.exec(text);
  if (!match) return null;
  const watts = BigInt(match[1]) * 1000n + BigInt(match[2] || '0') * 100n;
  if (watts < BigInt(MIN_POWER_W) || watts > BigInt(MAX_POWER_W)) return null;
  return Number(watts);
}

function wattsToKilowatts(watts) {
  return watts === null || watts === undefined ? null : Number(watts) / 1000;
}

module.exports = { kilowattsToWatts, wattsToKilowatts };
