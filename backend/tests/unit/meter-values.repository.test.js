const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  recordMeterValue,
  recordMeterValues,
  findLatestMeterValues,
  findLatestMeterValue,
  meterValueToWh,
} = require('../../src/modules/sessions/meter-values.repository');

describe('meter values repository', () => {
  it('stores source metadata and preserves the original unit', async () => {
    const calls = [];
    const db = {
      async query(sql, values) {
        calls.push({ sql, values });
        return { rows: [{ id: 7, unit: 'kWh' }] };
      },
    };

    const result = await recordMeterValue(db, {
      sessionId: 12,
      reportedAt: '2026-10-07T10:00:00Z',
      sampledAt: '2026-10-07T10:00:00.500Z',
      measurand: 'Current.Import',
      value: '1.25',
      unit: 'kWh',
      phase: 'L1',
      context: 'Sample.Periodic',
      sourceMessageId: 'message-1',
    });

    assert.equal(result.unit, 'kWh');
    assert.match(calls[0].sql, /reported_at, sampled_at/);
    assert.match(calls[0].sql, /ON CONFLICT \(session_id, reported_at, measurand, phase, context\)/);
    assert.deepEqual(calls[0].values, [
      12,
      '2026-10-07T10:00:00Z',
      '2026-10-07T10:00:00.500Z',
      'Current.Import',
      '1.25',
      'kWh',
      'L1',
      'Sample.Periodic',
      'message-1',
    ]);
  });

  it('binds every sample in a bulk insert with the correct placeholders', async () => {
    const calls = [];
    const db = {
      async query(sql, values) {
        calls.push({ sql, values });
      },
    };

    await recordMeterValues(db, 12, [
      {
        reportedAt: '2026-10-07T10:00:00Z',
        sampledAt: '2026-10-07T10:00:00.500Z',
        measurand: 'Energy.Active.Import.Register',
        value: '1',
        unit: 'Wh',
        phase: '',
        context: '',
        sourceMessageId: 'message-1',
      },
      {
        reportedAt: '2026-10-07T10:00:01Z',
        sampledAt: '2026-10-07T10:00:01.500Z',
        measurand: 'Energy.Active.Import.Register',
        value: '2',
        unit: 'Wh',
        phase: '',
        context: '',
        sourceMessageId: 'message-2',
      },
    ]);

    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10\), \(\$11, \$12, \$13, \$14, \$15, \$16, \$17, \$18, \$19, \$20\)/);
    assert.deepEqual(calls[0].values, [
      12, '2026-10-07T10:00:00Z', '2026-10-07T10:00:00.500Z',
      'Energy.Active.Import.Register', '1', 'Wh', 'Wh', '', '', 'message-1',
      12, '2026-10-07T10:00:01Z', '2026-10-07T10:00:01.500Z',
      'Energy.Active.Import.Register', '2', 'Wh', 'Wh', '', '', 'message-2',
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

  it('fetches the latest value independently for every meter stream', async () => {
    const calls = [];
    const latest = [{ measurand: 'Energy.Active.Import.Register', phase: '', context: '' }];
    const db = {
      async query(sql, values) {
        calls.push({ sql, values });
        return { rows: latest };
      },
    };

    assert.equal(await findLatestMeterValues(db, 12), latest);
    assert.match(calls[0].sql, /DISTINCT ON \(measurand, phase, context\)/);
    assert.match(calls[0].sql, /reported_at = sampled_at/);
    assert.match(calls[0].sql, /ORDER BY measurand, phase, context, sampled_at DESC, id DESC/);
    assert.deepEqual(calls[0].values, [12]);
  });

  it('converts the original Wh or kWh reading to Wh when read', () => {
    assert.equal(meterValueToWh({ value: '1250', unit: 'Wh' }), 1250);
    assert.equal(meterValueToWh({ value: '1.25', unit: 'kWh' }), 1250);
    assert.equal(meterValueToWh({ value: '1.005', unit: 'kWh' }), 1005);
    assert.equal(meterValueToWh({ value: '1.005', unit: 'kwh' }), 1005);
    assert.equal(meterValueToWh({ value: '250', unit: 'wh' }), 250);
  });

  it('rejects invalid readings instead of silently miscalculating', () => {
    assert.throws(() => meterValueToWh({ value: 'invalid', unit: 'Wh' }), TypeError);
    assert.throws(() => meterValueToWh({ value: '1', unit: 'MWh' }), /Unsupported meter value unit/);
  });
});
