export function kilowattsToWatts(value) {
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d))?$/.exec(text);
  if (!match) return null;
  const watts = BigInt(match[1]) * 1000n + BigInt(match[2] || '0') * 100n;
  return watts >= 100n && watts <= 100000000n ? watts : null;
}
