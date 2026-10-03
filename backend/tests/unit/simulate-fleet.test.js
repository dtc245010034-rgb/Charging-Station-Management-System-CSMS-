const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { percentile, backoffDelay, parseArgs, SCENARIOS } = require('../../../tools/lib/fleet-stats');

describe('tools/simulate-fleet: phần thuần', () => {
  it('percentile theo nearest-rank', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    assert.equal(percentile(values, 50), 50);
    assert.equal(percentile(values, 95), 95);
    assert.equal(percentile(values, 99), 99);
    assert.equal(percentile([30, 10, 20], 100), 30);
    assert.equal(percentile([7], 95), 7);
    assert.equal(percentile([], 95), null);
  });

  it('backoffDelay tăng gấp đôi, có trần và có jitter trong [0.5, 1]', () => {
    assert.equal(backoffDelay(0, () => 1), 200);
    assert.equal(backoffDelay(1, () => 1), 400);
    assert.equal(backoffDelay(10, () => 1), 5000);
    assert.equal(backoffDelay(2, () => 0), 400);
  });

  it('parseArgs: mặc định, ghi đè, và từ chối đầu vào sai', () => {
    const defaults = parseArgs([]);
    assert.equal(defaults.count, 50);
    assert.equal(defaults.prefix, 'SIM-');
    assert.deepEqual(defaults.scenarios, SCENARIOS);
    assert.equal(defaults.counterIds, false);
    const custom = parseArgs(['--count', '20', '--prefix', 'abc-', '--scenario', 'load,lock', '--counter-ids', '--duration', '10']);
    assert.deepEqual([custom.count, custom.prefix, custom.scenarios, custom.counterIds, custom.duration], [20, 'ABC-', ['load', 'lock'], true, 10]);
    assert.throws(() => parseArgs(['--count', '0']), /số nguyên dương/);
    assert.throws(() => parseArgs(['--count', '3']), /tối thiểu 5/);
    assert.throws(() => parseArgs(['--scenario', 'nope']), /không có/);
    assert.throws(() => parseArgs(['--bogus', '1']), /không hợp lệ/);
    assert.throws(() => parseArgs(['--url']), /Thiếu giá trị/);
  });
});
