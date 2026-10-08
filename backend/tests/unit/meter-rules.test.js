const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateMeterReading,
  isPlausibleMeterValue,
  isValidMeterDecimal,
} = require('../../src/modules/sessions/meter-rules');

const previous = {
  sampled_at: '2026-10-08T10:00:00.000Z',
  measurand: 'Energy.Active.Import.Register',
  value: '1200',
  unit: 'Wh',
};

function reading(overrides = {}) {
  return {
    sampledAt: '2026-10-08T10:00:01.000Z',
    measurand: 'Energy.Active.Import.Register',
    value: '1300',
    unit: 'Wh',
    ...overrides,
  };
}

describe('S-20 meter reading rules', () => {
  it('ignores older timestamps', () => {
    assert.deepEqual(
      evaluateMeterReading(previous, reading({ sampledAt: '2026-10-08T09:59:59.000Z' })),
      { action: 'ignore', reason: 'OLDER_TIMESTAMP' }
    );
  });

  it('does not treat an untrusted clock-skew timestamp as ordering evidence', () => {
    assert.deepEqual(
      evaluateMeterReading(previous, reading({
        sampledAt: '2026-10-08T10:00:00.000Z',
        value: '1',
        clockSkew: true,
      })),
      { action: 'save' }
    );
  });

  it('ignores an exact duplicate without requesting a warning', () => {
    assert.deepEqual(
      evaluateMeterReading(previous, reading({ sampledAt: previous.sampled_at, value: '1200.0' })),
      { action: 'ignore', reason: 'DUPLICATE' }
    );
  });

  it('ignores and reports a conflicting value at the same timestamp', () => {
    assert.deepEqual(
      evaluateMeterReading(previous, reading({ sampledAt: previous.sampled_at, value: '1201' })),
      { action: 'ignore', reason: 'CONFLICTING_TIMESTAMP' }
    );
  });

  it('stores a newer energy decrease but flags the session for review', () => {
    assert.deepEqual(
      evaluateMeterReading(previous, reading({ value: '1199' })),
      { action: 'review', reason: 'METER_VALUE_DECREASE' }
    );
  });

  it('compares energy readings across Wh and kWh without floating point rounding', () => {
    assert.deepEqual(
      evaluateMeterReading(
        { ...previous, value: '1.25', unit: 'kWh' },
        reading({ value: '1249.999999999999999999', unit: 'Wh' })
      ),
      { action: 'review', reason: 'METER_VALUE_DECREASE' }
    );
  });

  it('recognizes equivalent Wh and kWh readings and accepts zero values', () => {
    assert.deepEqual(
      evaluateMeterReading(
        { ...previous, value: '1', unit: 'kWh' },
        reading({ sampledAt: previous.sampled_at, value: '1000', unit: 'Wh' })
      ),
      { action: 'ignore', reason: 'DUPLICATE' }
    );
    assert.deepEqual(
      evaluateMeterReading({ ...previous, value: '0.000' }, reading({ value: '0e-10' })),
      { action: 'save' }
    );
  });

  it('flags only newer Energy decreases; Power and Current may taper down', () => {
    for (const [measurand, unit] of [
      ['Power.Active.Import', 'W'],
      ['Current.Import', 'A'],
    ]) {
      assert.deepEqual(
        evaluateMeterReading(
          { ...previous, measurand, value: '5000', unit },
          reading({ measurand, value: '4000', unit })
        ),
        { action: 'save' }
      );
    }
    assert.deepEqual(
      evaluateMeterReading(
        { ...previous, measurand: 'Energy.Active.Import.Register', value: '5000', unit: 'Wh' },
        reading({ measurand: 'Energy.Active.Import.Register', value: '4000', unit: 'Wh' })
      ),
      { action: 'review', reason: 'METER_VALUE_DECREASE' }
    );
  });

  it('accepts newer numeric values beyond JavaScript safe integer precision', () => {
    assert.deepEqual(
      evaluateMeterReading(
        { ...previous, value: '9007199254740992' },
        reading({ value: '9007199254740993' })
      ),
      { action: 'save' }
    );
  });

  it('bounds decimal input length and exponent before exact comparison', () => {
    assert.equal(isValidMeterDecimal('1e-1000'), true);
    assert.equal(isValidMeterDecimal('1e-1000000000'), false);
    assert.equal(isValidMeterDecimal('1'.repeat(129)), false);
  });

  it('rejects implausible values while retaining ordinary meter readings', () => {
    assert.equal(isPlausibleMeterValue('1e200', 'Energy.Active.Import.Register', 'Wh'), false);
    assert.equal(isPlausibleMeterValue('1e-130', 'Energy.Active.Import.Register', 'Wh'), false);
    assert.equal(isPlausibleMeterValue('-1', 'Power.Active.Import', 'W'), false);
    assert.equal(isPlausibleMeterValue('1000000000001', 'Energy.Active.Import.Register', 'Wh'), false);
    assert.equal(isPlausibleMeterValue('1000000000', 'Energy.Active.Import.Register', 'kWh'), true);
    assert.equal(isPlausibleMeterValue('0', 'Current.Import', 'A'), true);
    assert.equal(isPlausibleMeterValue('0.000000001', 'Current.Import', 'A'), true);
    assert.equal(isPlausibleMeterValue('7000', 'Power.Active.Import', 'W'), true);
  });

  it('compares expanded PostgreSQL NUMERIC strings without the wire-input length limit', () => {
    const oldHugeReading = '1' + '0'.repeat(200);
    const oldTinyReading = `0.${'0'.repeat(129)}1`;
    assert.deepEqual(
      evaluateMeterReading(
        { ...previous, value: oldHugeReading },
        reading({ value: '7000' })
      ),
      { action: 'review', reason: 'METER_VALUE_DECREASE' }
    );
    assert.deepEqual(
      evaluateMeterReading(
        { ...previous, value: oldTinyReading },
        reading({ value: '7000' })
      ),
      { action: 'save' }
    );
  });
});
