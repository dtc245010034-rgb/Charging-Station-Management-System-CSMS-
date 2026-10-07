const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  recordMeterValue,
  findLatestMeterValue,
  meterValueToWh,
} = require('../../src/modules/sessions/meter-values.repository');

describe('meter values repository', () => {
  it('stores the source unit unchanged for later conversion', async () => {
    const calls = [];
    const db = {
      async query(sql, values) {
        calls.push({ sql, values });
        return { rows: [{ id: 7, unit: 'kWh' }] };
      },
    };

    const result = await recordMeterValue(db, {
      sessionId: 12,
      sampledAt: '2026-10-07T10:00:00Z',
      measurand: 'Energy.Active.Import.Register',
      value: '1.25',
      unit: 'kWh',
    });

    assert.equal(result.unit, 'kWh');
    assert.match(calls[0].sql, /unit, raw_unit/);
    assert.deepEqual(calls[0].values, [
      12,
      '2026-10-07T10:00:00Z',
      'Energy.Active.Import.Register',
      '1.25',
      'kWh',
    ]);
  });

  it('fetches the newest session reading in index order', async () => {
    const calls = [];
    const latest = { session_id: 12, value: '1.25', unit: 'kWh' };
    const db = {
      async query(sql, values) {
        calls.push({ sql, values });
        return { rows: [latest] };
      },
    };

    assert.equal(await findLatestMeterValue(db, 12), latest);
    assert.match(calls[0].sql, /WHERE session_id = \$1/);
    assert.match(calls[0].sql, /ORDER BY sampled_at DESC, id DESC\s+LIMIT 1/);
    assert.match(calls[0].sql, /COALESCE\(raw_unit, unit\) AS unit/);
    assert.deepEqual(calls[0].values, [12]);
  });

  it('converts the original Wh or kWh reading to Wh when read', () => {
    assert.equal(meterValueToWh({ value: '1250', unit: 'Wh' }), 1250);
    assert.equal(meterValueToWh({ value: '1.25', unit: 'kWh' }), 1250);
  });

  it('rejects invalid readings instead of silently miscalculating', () => {
    assert.throws(() => meterValueToWh({ value: 'invalid', unit: 'Wh' }), TypeError);
    assert.throws(() => meterValueToWh({ value: '1', unit: 'MWh' }), /Unsupported meter value unit/);
  });
});
