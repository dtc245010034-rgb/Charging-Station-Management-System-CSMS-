const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
process.env.CSMS_SKIP_DOTENV = '1';
process.env.DATABASE_URL ||= 'postgresql://localhost/csms_test';
process.env.JWT_SECRET ||= 'x'.repeat(40);
process.env.APP_ORIGIN ||= 'http://localhost:3000';
const {
  createMeterValuesHandler,
  validatePayload,
  MAX_METER_VALUES,
  MAX_SAMPLED_VALUES,
} = require('../../src/modules/ocpp/handlers/meter-values');
const { createOcppHandlers } = require('../../src/modules/ocpp/handlers');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { OcppCallError } = require('../../src/modules/ocpp/frames');

function transactionalPool(query) {
  return {
    async connect() {
      return { query, release() {} };
    },
  };
}

const samplePayload = {
  connectorId: 1,
  transactionId: 1000,
  meterValue: [
    {
      timestamp: '2026-09-28T20:31:27.905Z',
      sampledValue: [
        { value: '61', context: 'Sample.Periodic', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
        { value: '22000', measurand: 'Power.Active.Import', unit: 'W' },
        { value: '31.9', measurand: 'Current.Import', unit: 'A' },
        { value: '230', measurand: 'Voltage', unit: 'V' },
      ],
    },
    {
      timestamp: '2026-09-28T20:31:37.905Z',
      sampledValue: [
        { value: '71', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
      ],
    },
  ],
};

describe('MeterValues handler (T-41)', () => {
  it('is registered as an OCPP handler', () => {
    const handler = createOcppHandlers({
      ocppPool: { query: async () => ({ rows: [] }) },
      env: {},
    });
    assert.equal(typeof handler.MeterValues, 'function');
  });

  it('validates and parses both meterValue and sampledValue levels', () => {
    const readings = validatePayload(samplePayload, () => Date.parse('2026-09-28T20:31:27.905Z'));
    assert.deepEqual(readings, [
      {
        reportedAt: '2026-09-28T20:31:27.905Z',
        sampledAt: '2026-09-28T20:31:27.905Z',
        measurand: 'Energy.Active.Import.Register',
        value: '61',
        unit: 'Wh',
        phase: '',
        context: 'Sample.Periodic',
      },
      {
        reportedAt: '2026-09-28T20:31:27.905Z',
        sampledAt: '2026-09-28T20:31:27.905Z',
        measurand: 'Power.Active.Import',
        value: '22000',
        unit: 'W',
        phase: '',
        context: '',
      },
      {
        reportedAt: '2026-09-28T20:31:27.905Z',
        sampledAt: '2026-09-28T20:31:27.905Z',
        measurand: 'Current.Import',
        value: '31.9',
        unit: 'A',
        phase: '',
        context: '',
      },
      {
        reportedAt: '2026-09-28T20:31:37.905Z',
        sampledAt: '2026-09-28T20:31:37.905Z',
        measurand: 'Energy.Active.Import.Register',
        value: '71',
        unit: 'Wh',
        phase: '',
        context: '',
      },
    ]);
  });

  it('synchronously looks up connector and inserts supported samples in one bulk query before returning CALLRESULT (D5)', async () => {
    const calls = [];
    const handler = createMeterValuesHandler({
      pool: transactionalPool(async (sql, params) => {
          calls.push({ sql, params });
          if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
          if (sql.includes('FROM charging_sessions WHERE id = $1 AND status')) return { rowCount: 1, rows: [{ id: 44 }] };
          return { rowCount: 4, rows: [] };
        }),
      now: () => Date.parse('2026-09-28T20:31:27.905Z'),
    });

    assert.deepEqual(
      await handler(samplePayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } }),
      {}
    );
    const connectorCall = calls.find((call) => call.sql.includes('FROM connectors c'));
    const insertCall = calls.find((call) => call.sql.includes('INSERT INTO meter_values'));
    assert.deepEqual(connectorCall.params, [8, 1, 1000]);
    assert.equal((insertCall.sql.match(/\(\$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+\)/g) || []).length, 4);
    assert.match(insertCall.sql, /ON CONFLICT \(session_id, reported_at, measurand, phase, context\) DO NOTHING/);
    assert.deepEqual(insertCall.params.slice(0, 6), [44, '2026-09-28T20:31:27.905Z', '2026-09-28T20:31:27.905Z', 'Energy.Active.Import.Register', '61', 'Wh']);
  });

  it('stores all samples from each periodic request with a separate batch insert', async () => {
    let batchInserts = 0;
    const handler = createMeterValuesHandler({
      pool: transactionalPool(async (sql) => {
          if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
          if (sql.includes('FROM charging_sessions WHERE id = $1 AND status')) return { rowCount: 1, rows: [{ id: 44 }] };
          if (sql.includes('INSERT INTO meter_values')) batchInserts += 1;
          return { rowCount: 1, rows: [] };
        }),
      now: () => Date.parse('2026-09-28T20:31:27.905Z'),
    });
    const connection = { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } };

    await handler(samplePayload, { connection });
    await handler(samplePayload, { connection });
    assert.equal(batchInserts, 2);
  });

  it('executes database work synchronously before CALLRESULT is sent (D5)', async () => {
    const events = [];
    const handlers = {
      MeterValues: createMeterValuesHandler({
        pool: transactionalPool(async (sql) => {
            if (sql === 'COMMIT') events.push('transaction committed');
            if (sql.includes('FROM connectors c')) {
              events.push('database lookup');
              return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
            }
            if (sql.includes('FROM charging_sessions WHERE id = $1 AND status')) return { rowCount: 1, rows: [{ id: 44 }] };
            return { rowCount: 1, rows: [] };
          }),
        now: () => Date.parse('2026-09-28T20:31:27.905Z'),
      }),
    };
    const messageHandler = createOcppMessageHandler({
      handlers,
      messageStore: {
        async begin() { return { state: 'new' }; },
        async complete() {
          events.push('dedupe save started');
          await new Promise((resolve) => setImmediate(resolve));
          events.push('dedupe save completed');
        },
        async release() {},
      },
    });
    const connection = {
      chargePointCode: 'CP-TEST',
      chargePoint: { id: 8 },
      send(_frame, callback) {
        events.push('CALLRESULT sent');
        callback();
      },
    };

    await messageHandler.handleMessage(
      connection,
      JSON.stringify([2, 'meter-values-1', 'MeterValues', samplePayload])
    );
    assert.deepEqual(events, [
      'database lookup',
      'transaction committed',
      'dedupe save started',
      'dedupe save completed',
      'CALLRESULT sent',
    ]);
  });

  it('writes readings for an idle connector to orphan_messages synchronously before acknowledging (D5)', async () => {
    const calls = [];
    const handler = createMeterValuesHandler({
      pool: transactionalPool(async (sql, params) => {
          calls.push({ sql, params });
          return sql.includes('FROM connectors c')
            ? { rowCount: 1, rows: [{ connector_id: 3, session_id: null }] }
            : { rowCount: 1, rows: [] };
        }),
      now: () => Date.parse('2026-09-28T20:31:27.905Z'),
      logWarning: () => {},
    });

    assert.deepEqual(
      await handler(samplePayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } }),
      {}
    );
    const orphanCall = calls.find((call) => call.sql.includes('INSERT INTO orphan_messages'));
    assert.ok(orphanCall);
    assert.equal(orphanCall.params[2], 'NO_ACTIVE_SESSION');
    assert.equal(JSON.parse(orphanCall.params[1]).meterValue.length, 2);
  });

  it('enforces D6 clock skew: replaces timestamp > 24h with receivedAt and flags needs_review', async () => {
    const calls = [];
    const fixedNow = new Date('2026-10-07T12:00:00.000Z');
    const handler = createMeterValuesHandler({
      pool: transactionalPool(async (sql, params) => {
          calls.push({ sql, params });
          if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
          if (sql.includes('FROM charging_sessions WHERE id = $1 AND status')) return { rowCount: 1, rows: [{ id: 44 }] };
          return { rowCount: 1, rows: [] };
        }),
      now: () => fixedNow,
    });

    const skewedPayload = {
      connectorId: 1,
      transactionId: 1000,
      meterValue: [
        {
          timestamp: '1970-01-01T00:00:00.000Z',
          sampledValue: [{ value: '500', measurand: 'Energy.Active.Import.Register', unit: 'Wh' }],
        },
      ],
    };

    await handler(skewedPayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } });
    const insertCall = calls.find((call) => call.sql.includes('INSERT INTO meter_values'));
    const reviewCall = calls.find((call) => call.sql.includes('UPDATE charging_sessions'));
    assert.equal(insertCall.params[1], '1970-01-01T00:00:00.000Z');
    assert.equal(insertCall.params[2], fixedNow.toISOString());
    assert.match(reviewCall.sql, /UPDATE charging_sessions\s+SET needs_review = TRUE/);
    assert.deepEqual(reviewCall.params, [44, 'CLOCK_SKEW']);
  });

  it('applies S-20 in a locked session transaction and warns only for non-identical ignored samples', async () => {
    const calls = [];
    const warnings = [];
    const fixedNow = Date.parse('2026-10-08T10:01:00.000Z');
    const handler = createMeterValuesHandler({
      pool: transactionalPool(async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
        if (sql.includes('FROM charging_sessions WHERE id = $1 AND status')) return { rowCount: 1, rows: [{ id: 44 }] };
        if (sql.includes('DISTINCT ON (measurand, phase, context)')) {
          return {
            rowCount: 1,
            rows: [{
              measurand: 'Energy.Active.Import.Register',
              phase: '',
              context: 'S-20.Unit',
              sampled_at: '2026-10-08T10:00:00.000Z',
              value: '1000',
              unit: 'Wh',
            }],
          };
        }
        return { rowCount: 1, rows: [] };
      }),
      now: () => fixedNow,
      logWarning: (message) => warnings.push(message),
    });

    await handler({
      connectorId: 1,
      transactionId: 1000,
      meterValue: [
        {
          timestamp: '2026-10-08T09:59:00.000Z',
          sampledValue: [{
            value: '900',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.Unit',
          }],
        },
        {
          timestamp: '2026-10-08T10:00:00.000Z',
          sampledValue: [{
            value: '1000.0',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.Unit',
          }],
        },
        {
          timestamp: '2026-10-08T10:00:00.000Z',
          sampledValue: [{
            value: '1001',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.Unit',
          }],
        },
        {
          timestamp: '2026-10-08T10:00:30.000Z',
          sampledValue: [{
            value: '999',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.Unit',
          }],
        },
      ],
    }, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } });

    const sessionLock = calls.find((call) => call.sql.includes("status = 'CHARGING' FOR UPDATE"));
    assert.ok(sessionLock, 'session row must be locked before reading its latest values');
    const insert = calls.find((call) => call.sql.includes('INSERT INTO meter_values'));
    assert.equal((insert.sql.match(/\(\$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+, \$\d+\)/g) || []).length, 1);
    assert.equal(insert.params[4], '999');
    assert.equal(warnings.filter((message) => message.includes('reason: OLDER_TIMESTAMP')).length, 1);
    assert.equal(warnings.filter((message) => message.includes('reason: CONFLICTING_TIMESTAMP')).length, 1);
    assert.equal(warnings.filter((message) => message.includes('reason: METER_VALUE_DECREASE')).length, 1);
    assert.equal(warnings.some((message) => message.includes('reason: DUPLICATE')), false);
  });

  it('processes samples inside a payload in sampled-time order', async () => {
    const calls = [];
    const handler = createMeterValuesHandler({
      pool: transactionalPool(async (sql, params) => {
        calls.push({ sql, params });
        if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: 44 }] };
        if (sql.includes('FROM charging_sessions WHERE id = $1 AND status')) return { rowCount: 1, rows: [{ id: 44 }] };
        if (sql.includes('DISTINCT ON (measurand, phase, context)')) return { rowCount: 0, rows: [] };
        return { rowCount: 3, rows: [] };
      }),
      now: () => Date.parse('2026-10-08T10:05:00.000Z'),
    });

    await handler({
      connectorId: 1,
      transactionId: 1000,
      meterValue: [
        {
          timestamp: '2026-10-08T10:03:00.000Z',
          sampledValue: [{
            value: '1300',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.OutOfOrder',
          }],
        },
        {
          timestamp: '2026-10-08T10:01:00.000Z',
          sampledValue: [{
            value: '1000',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.OutOfOrder',
          }],
        },
        {
          timestamp: '2026-10-08T10:02:00.000Z',
          sampledValue: [{
            value: '1100',
            measurand: 'Energy.Active.Import.Register',
            unit: 'Wh',
            context: 'S-20.OutOfOrder',
          }],
        },
      ],
    }, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } });

    const insert = calls.find((call) => call.sql.includes('INSERT INTO meter_values'));
    assert.deepEqual(
      insert.params.filter((_, index) => index % 10 === 4),
      ['1000', '1100', '1300']
    );
  });

  it('records CHARGE_POINT_MISMATCH when transaction belongs to another charge point (D12)', async () => {
    const calls = [];
    const handler = createMeterValuesHandler({
      pool: transactionalPool(async (sql, params) => {
          calls.push({ sql, params });
          if (sql.includes('FROM connectors c')) return { rowCount: 1, rows: [{ connector_id: 3, session_id: null }] };
          if (sql.includes('SELECT charge_point_id FROM charging_sessions')) return { rowCount: 1, rows: [{ charge_point_id: 99 }] };
          return { rowCount: 1, rows: [] };
        }),
      now: () => Date.parse('2026-09-28T20:31:27.905Z'),
      logWarning: () => {},
    });

    await handler(samplePayload, { connection: { chargePointCode: 'CP-TEST', chargePoint: { id: 8 } } });
    const orphanCall = calls.find((call) => call.sql.includes('INSERT INTO orphan_messages'));
    assert.ok(orphanCall);
    assert.equal(orphanCall.params[2], 'CHARGE_POINT_MISMATCH');
  });

  it('rejects malformed payloads with OCPP constraint errors and respects array size limits', () => {
    assert.throws(
      () => validatePayload({ ...samplePayload, connectorId: -1 }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    assert.throws(
      () => validatePayload({ ...samplePayload, meterValue: [{ timestamp: 'bad', sampledValue: [] }] }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    assert.throws(
      () => validatePayload({
        ...samplePayload,
        meterValue: [{ timestamp: '2026-09-28T20:31:27.905Z', sampledValue: [{ value: 'NaN' }] }],
      }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    assert.throws(
      () => validatePayload({
        ...samplePayload,
        meterValue: [{
          timestamp: '2026-09-28T20:31:27.905Z',
          sampledValue: [{ value: '1e-1000000000' }],
        }],
      }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    for (const value of ['1e200', '1e-130', '-1', '1000000000001']) {
      assert.throws(
        () => validatePayload({
          ...samplePayload,
          meterValue: [{
            timestamp: '2026-09-28T20:31:27.905Z',
            sampledValue: [{
              value,
              measurand: 'Energy.Active.Import.Register',
              unit: 'Wh',
            }],
          }],
        }),
        (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
      );
    }
    // Overflow meterValue length
    const tooManyMeterValues = Array(MAX_METER_VALUES + 1).fill({
      timestamp: '2026-09-28T20:31:27.905Z',
      sampledValue: [{ value: '1' }],
    });
    assert.throws(
      () => validatePayload({ ...samplePayload, meterValue: tooManyMeterValues }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    // Overflow sampledValue length
    const tooManySamples = Array(MAX_SAMPLED_VALUES + 1).fill({ value: '1' });
    assert.throws(
      () => validatePayload({
        ...samplePayload,
        meterValue: [{ timestamp: '2026-09-28T20:31:27.905Z', sampledValue: tooManySamples }],
      }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
  });
});
