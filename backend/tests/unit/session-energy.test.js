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
});
