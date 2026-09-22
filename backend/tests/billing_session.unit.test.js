const { describe, it } = require('node:test');
const assert = require('node:assert');

// Logic extracted directly from server.js and db.js for isolated unit testing
function calculateSessionEnergy(meter, startMeter) {
  const numMeter = Number(meter);
  const numStart = Number(startMeter);
  if (numMeter < numStart) {
    throw new Error('Meter không được nhỏ hơn meter bắt đầu');
  }
  return numMeter - numStart;
}

function calculateStopSessionValues(bodyEndMeter, startMeter, currentEnergyKwh, tariffPricePerKwh) {
  const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const numStart = Number(startMeter);
  const numEnergy = Number(currentEnergyKwh);
  const endMeter = numeric(bodyEndMeter, numStart + numEnergy);
  const energyKwh = endMeter - numStart;
  const price = Number(tariffPricePerKwh || 0);
  const amount = energyKwh * price;
  return { endMeter, energyKwh, amount };
}

describe('Unit Tests — Charging Session & Billing Calculation Logic', () => {
  // --------------------------------------------------------------------------
  // UT-SES-01, UT-SES-02 [P0]: Energy Calculation & Meter Validation
  // --------------------------------------------------------------------------
  describe('UT-SES-01, UT-SES-02 [P0]: Meter Reading Validation & Energy Delta', () => {
    it('UT-SES-01 [P0]: should correctly compute energy_kwh = meter - start_meter', () => {
      const startMeter = 100.0;
      const currentMeter = 125.4;
      const energy = calculateSessionEnergy(currentMeter, startMeter);
      assert.strictEqual(Math.round(energy * 10) / 10, 25.4, 'Energy delta must match exactly 25.4 kWh');
    });

    it('UT-SES-01 [P0]: should return 0 energy when meter equals start_meter', () => {
      const energy = calculateSessionEnergy(50, 50);
      assert.strictEqual(energy, 0, 'Energy delta should be 0 when meter is unchanged');
    });

    it('UT-SES-02 [P0]: should throw error when meter < start_meter', () => {
      assert.throws(
        () => calculateSessionEnergy(99.9, 100.0),
        {
          name: 'Error',
          message: 'Meter không được nhỏ hơn meter bắt đầu',
        },
        'Must reject meter reading smaller than start_meter'
      );
    });
  });

  // --------------------------------------------------------------------------
  // UT-BIL-01, UT-BIL-02, UT-BIL-03, UT-BIL-04 [P0, P1]: Billing Calculations
  // --------------------------------------------------------------------------
  describe('UT-BIL-01, UT-BIL-02, UT-BIL-03, UT-BIL-04 [P0, P1]: Billing & Tariff Math', () => {
    it('UT-BIL-01 [P0]: should calculate total amount as (endMeter - startMeter) * price_per_kwh', () => {
      const startMeter = 100;
      const endMeter = 130; // 30 kWh
      const tariffPrice = 3500; // 3500 VND/kWh

      const result = calculateStopSessionValues(endMeter, startMeter, 30, tariffPrice);

      assert.strictEqual(result.endMeter, 130);
      assert.strictEqual(result.energyKwh, 30);
      assert.strictEqual(result.amount, 30 * 3500, '30 kWh * 3500 = 105,000 VND');
    });

    it('UT-BIL-02 [P0]: should yield amount = 0 when endMeter == startMeter (0 kWh consumed)', () => {
      const result = calculateStopSessionValues(200, 200, 0, 3850);
      assert.strictEqual(result.energyKwh, 0);
      assert.strictEqual(result.amount, 0, 'Zero kWh must produce 0 amount');
    });

    it('UT-BIL-03 [P1]: should produce 0 amount when tariff price is 0 or null (Free Charging)', () => {
      const resNull = calculateStopSessionValues(150, 100, 50, null);
      assert.strictEqual(resNull.amount, 0, 'Amount must be 0 when tariff is missing');

      const resZero = calculateStopSessionValues(150, 100, 50, 0);
      assert.strictEqual(resZero.amount, 0, 'Amount must be 0 when tariff price is 0');
    });

    it('UT-SES-03 [P0]: should fallback end_meter to start_meter + energy_kwh when bodyEndMeter is omitted', () => {
      const startMeter = 100;
      const energyKwh = 18.5; // recorded previously from meter values
      const tariffPrice = 3000;

      // Passing undefined or null as bodyEndMeter
      const result = calculateStopSessionValues(undefined, startMeter, energyKwh, tariffPrice);

      assert.strictEqual(result.endMeter, 118.5, 'endMeter must fallback to start + energy');
      assert.strictEqual(result.energyKwh, 18.5);
      assert.strictEqual(result.amount, 18.5 * 3000);
    });

    it('UT-BIL-04 [P1]: should correctly compute decimal kWh and price', () => {
      const startMeter = 10.25;
      const endMeter = 25.50; // delta = 15.25 kWh
      const pricePerKwh = 3850.5;

      const result = calculateStopSessionValues(endMeter, startMeter, 15.25, pricePerKwh);
      const expectedAmount = 15.25 * 3850.5;

      assert.strictEqual(result.energyKwh, 15.25);
      assert.strictEqual(result.amount, expectedAmount);
    });
  });

  // --------------------------------------------------------------------------
  // UT-UTIL-01, UT-UTIL-02 [P1]: Helper functions in db.js and server.js
  // --------------------------------------------------------------------------
  describe('UT-UTIL-01, UT-UTIL-02 [P1]: Helper Functions', () => {
    it('UT-UTIL-01 [P1]: should convert SQL ? placeholders to PostgreSQL $1, $2, ...', () => {
      // Logic from db.js convertPlaceholders
      function convertPlaceholders(sql) {
        let index = 0;
        return sql.replace(/\?/g, () => `$${++index}`);
      }

      const query1 = 'SELECT * FROM users WHERE id = ?';
      assert.strictEqual(convertPlaceholders(query1), 'SELECT * FROM users WHERE id = $1');

      const queryMultiple = 'INSERT INTO stations (name, address, status) VALUES (?, ?, ?)';
      assert.strictEqual(convertPlaceholders(queryMultiple), 'INSERT INTO stations (name, address, status) VALUES ($1, $2, $3)');

      const queryNone = 'SELECT COUNT(*) FROM charge_points';
      assert.strictEqual(convertPlaceholders(queryNone), 'SELECT COUNT(*) FROM charge_points');
    });

    it('UT-UTIL-02 [P1]: numeric helper should handle numbers, numeric strings, and fallback correctly', () => {
      const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

      assert.strictEqual(numeric(42), 42);
      assert.strictEqual(numeric('123.45'), 123.45);
      assert.strictEqual(numeric(0), 0);
      assert.strictEqual(numeric('0'), 0);
      assert.strictEqual(numeric('invalid', 10), 10);
      assert.strictEqual(numeric(null, 5), 0, 'In JavaScript Number(null) is 0 which is finite, so it returns 0');
      assert.strictEqual(numeric(undefined, 7), 7); // Number(undefined) is NaN -> fallback 7
      assert.strictEqual(numeric(NaN, 99), 99);
    });
  });
});
