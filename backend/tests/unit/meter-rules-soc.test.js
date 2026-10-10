const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isPlausibleMeterValue } = require('../../src/modules/sessions/meter-rules');

describe('meter-rules: ngưỡng SoC (phần trăm pin)', () => {
  it('0, 55, 100 hợp lệ', () => {
    for (const value of ['0', '55', '100', '99.5']) {
      assert.equal(isPlausibleMeterValue(value, 'SoC', 'Percent'), true, value);
    }
  });

  it('101, 150 không hợp lệ', () => {
    for (const value of ['100.1', '101', '150']) {
      assert.equal(isPlausibleMeterValue(value, 'SoC', 'Percent'), false, value);
    }
  });

  it('âm hoặc không phải số không hợp lệ', () => {
    assert.equal(isPlausibleMeterValue('-1', 'SoC', 'Percent'), false);
    assert.equal(isPlausibleMeterValue('abc', 'SoC', 'Percent'), false);
  });

  it('ngưỡng của Energy và Power không đổi', () => {
    assert.equal(isPlausibleMeterValue('150', 'Energy.Active.Import.Register', 'Wh'), true);
    assert.equal(isPlausibleMeterValue('1000000001', 'Energy.Active.Import.Register', 'kWh'), false);
    assert.equal(isPlausibleMeterValue('150000', 'Power.Active.Import', 'W'), true);
  });
});
