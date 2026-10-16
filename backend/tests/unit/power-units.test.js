const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { kilowattsToWatts, wattsToKilowatts } = require('../../src/modules/power/units');

describe('power units conversion', () => {
  it('converts valid kilowatt values to watts accurately', () => {
    assert.strictEqual(kilowattsToWatts(11), 11000);
    assert.strictEqual(kilowattsToWatts('22'), 22000);
    assert.strictEqual(kilowattsToWatts(7.4), 7400);
    assert.strictEqual(kilowattsToWatts('3.7'), 3700);
  });

  it('rejects invalid or out of range kilowatt values', () => {
    assert.strictEqual(kilowattsToWatts('abc'), null);
    assert.strictEqual(kilowattsToWatts(0.01), null);
    assert.strictEqual(kilowattsToWatts(-5), null);
  });

  it('converts watts to kilowatts correctly', () => {
    assert.strictEqual(wattsToKilowatts(11000), 11);
    assert.strictEqual(wattsToKilowatts(7400), 7.4);
    assert.strictEqual(wattsToKilowatts(null), null);
    assert.strictEqual(wattsToKilowatts(undefined), null);
  });
});
