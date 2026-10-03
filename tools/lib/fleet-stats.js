const SCENARIOS = ['load', 'skew', 'clock', 'netcut', 'lock', 'restart'];

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

function backoffDelay(attempt, random = Math.random, baseMs = 200, capMs = 5000) {
  return Math.min(capMs, baseMs * 2 ** attempt) * (0.5 + random() / 2);
}

function parseArgs(argv) {
  const options = { url: 'http://localhost:3000', count: 50, duration: 30, prefix: 'SIM-', scenarios: [...SCENARIOS], counterIds: false, out: 'docs/testing' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--counter-ids') { options.counterIds = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Thiếu giá trị cho ${flag}`);
    i += 1;
    if (flag === '--url') options.url = value;
    else if (flag === '--prefix') options.prefix = value.toUpperCase();
    else if (flag === '--out') options.out = value;
    else if (flag === '--count' || flag === '--duration') {
      const number = Number(value);
      if (!Number.isInteger(number) || number <= 0) throw new Error(`${flag} phải là số nguyên dương`);
      options[flag.slice(2)] = number;
    } else if (flag === '--scenario') {
      const names = value === 'all' ? SCENARIOS : value.split(',');
      const unknown = names.filter((name) => !SCENARIOS.includes(name));
      if (unknown.length) throw new Error(`Kịch bản không có: ${unknown.join(', ')}. Hợp lệ: ${SCENARIOS.join(', ')}`);
      options.scenarios = names;
    } else throw new Error(`Tham số không hợp lệ: ${flag}`);
  }
  if (options.count < 5) throw new Error('--count tối thiểu 5');
  return options;
}

module.exports = { SCENARIOS, percentile, backoffDelay, parseArgs };
