const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateEnergyKwh } = require('../../src/modules/sessions/energy');

describe('calculateEnergyKwh', () => {
  const sessions = [
    {
      name: 'phiên thường',
      meterStartWh: 12000,
      meterStopWh: 18500,
      expectedKwh: 6.5,
    },
    {
      name: 'số đo cuối nhỏ hơn số đo đầu',
      meterStartWh: 18500,
      meterStopWh: 12000,
      expectedKwh: null,
    },
    {
      name: 'số đo đầu và cuối bằng nhau',
      meterStartWh: 12500,
      meterStopWh: 12500,
      expectedKwh: 0,
    },
  ];

  for (const session of sessions) {
    it(`${session.name}: ${session.meterStartWh} Wh → ${session.meterStopWh} Wh`, () => {
      assert.equal(
        calculateEnergyKwh(session.meterStartWh, session.meterStopWh),
        session.expectedKwh
      );
    });
  }

  it('hỗ trợ string số nguyên từ PostgreSQL driver', () => {
    assert.equal(calculateEnergyKwh('12000', '18500'), 6.5);
    assert.equal(calculateEnergyKwh('1000', '1000'), 0);
    assert.equal(calculateEnergyKwh('18500', '12000'), null);
  });

  it('hỗ trợ BigInt', () => {
    assert.equal(calculateEnergyKwh(12000n, 18500n), 6.5);
  });

  it('trả về null khi phiên chưa chốt meterStopWh (null hoặc undefined)', () => {
    assert.equal(calculateEnergyKwh(12000, null), null);
    assert.equal(calculateEnergyKwh('12000', undefined), null);
  });

  it('từ chối đầu vào không hợp lệ bằng TypeError', () => {
    assert.throws(() => calculateEnergyKwh('abc', 1000), TypeError);
    assert.throws(() => calculateEnergyKwh(-1, 1000), TypeError);
    assert.throws(() => calculateEnergyKwh(1000, -1), TypeError);
    assert.throws(() => calculateEnergyKwh(10.5, 1000), TypeError);
  });
});
