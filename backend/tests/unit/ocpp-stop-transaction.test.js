const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createStopTransactionHandler } = require('../../src/modules/ocpp/handlers/stop-transaction');
const { OcppCallError } = require('../../src/modules/ocpp/frames');

const CONNECTION = { chargePointCode: 'STOP-UNIT-CP', chargePoint: { id: 42, code: 'STOP-UNIT-CP' } };
const NOW = Date.parse('2026-10-07T04:00:00.000Z');

function validPayload(overrides = {}) {
  return {
    transactionId: 17,
    meterStop: 1250,
    timestamp: new Date(NOW).toISOString(),
    reason: 'Remote',
    ...overrides,
  };
}

describe('S-18 StopTransaction handler', () => {
  it('chốt phiên theo transactionId/trụ, giữ số đo, timestamp và lý do', async () => {
    let update;
    const transactionData = [{
      timestamp: new Date(NOW).toISOString(),
      sampledValue: [{ value: '1250', measurand: 'Energy.Active.Import.Register', unit: 'Wh' }],
    }];
    let meterValues;
    const handler = createStopTransactionHandler({
      pool: {
        query: async (sql, params) => {
          if (sql.includes('SELECT connector_no')) {
            return { rowCount: 1, rows: [{ connector_no: 1 }] };
          }
          update = { sql, params };
          return { rowCount: 1, rows: [{ meter_start: '1000' }] };
        },
      },
      now: () => NOW,
      logError: () => {},
      persistTransactionData: async (payload, context) => { meterValues = { payload, context }; },
    });

    assert.deepEqual(await handler(validPayload({ transactionData }), {
      connection: CONNECTION,
      messageId: 'stop-message-17',
    }), {});
    assert.deepEqual(meterValues, {
      payload: {
        connectorId: 1,
        transactionId: 17,
        meterValue: transactionData,
      },
      context: { connection: CONNECTION, messageId: 'stop-message-17' },
    });
    assert.match(update.sql, /WHERE id = \$1\s+AND charge_point_id = \$6\s+AND status = 'CHARGING'/);
    assert.deepEqual(update.params, [17, 1250, new Date(NOW).toISOString(), 'Remote', false, 42, JSON.stringify(transactionData), false]);
    assert.match(update.sql, /meter_start > \$2/);
    assert.match(update.sql, /status = 'COMPLETED'/);
  });

  it('transactionData bị lỗi vẫn chốt phiên COMPLETED và bật needs_review kèm lý do INVALID_TRANSACTION_DATA', async () => {
    let update;
    const warnings = [];
    const transactionData = [{ bad: 'sample' }];
    const handler = createStopTransactionHandler({
      pool: {
        query: async (sql, params) => {
          if (sql.includes('SELECT connector_no')) {
            return { rowCount: 1, rows: [{ connector_no: 1 }] };
          }
          update = { sql, params };
          return { rowCount: 1, rows: [{ meter_start: '1000' }] };
        },
      },
      now: () => NOW,
      logWarning: (msg) => warnings.push(msg),
      logError: () => {},
      persistTransactionData: async () => {
        throw new OcppCallError('PropertyConstraintViolation', 'Sample invalid');
      },
    });

    const result = await handler(validPayload({ transactionData }), {
      connection: CONNECTION,
      messageId: 'stop-fault-17',
    });
    assert.deepEqual(result, {});
    assert.match(update.sql, /status = 'COMPLETED'/);
    assert.match(update.sql, /INVALID_TRANSACTION_DATA/);
    assert.equal(update.params[7], true); // transactionDataFailed = true
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Không thể lưu transactionData/);
  });

  it('mặc định reason là Local; số đo lùi đánh dấu needs_review', async () => {
    let update;
    const handler = createStopTransactionHandler({
      pool: {
        query: async (sql, params) => {
          update = { sql, params };
          return { rowCount: 1, rows: [{ meter_start: '1000' }] };
        },
      },
      now: () => NOW,
      logError: () => {},
    });

    await handler(validPayload({ meterStop: 900, reason: undefined }), { connection: CONNECTION });
    assert.equal(update.params[3], 'Local');
    assert.match(update.sql, /needs_review = .*meter_start > \$2/s);
    assert.match(update.sql, /METER_STOP_BELOW_START/);
  });

  it('timestamp lệch quá 24 giờ thay bằng giờ nhận và bật needs_review', async () => {
    let update;
    const handler = createStopTransactionHandler({
      pool: {
        query: async (sql, params) => {
          update = { sql, params };
          return { rowCount: 1, rows: [{ meter_start: '1000' }] };
        },
      },
      now: () => NOW,
      logError: () => {},
    });

    await handler(validPayload({ timestamp: '2020-01-01T00:00:00.000Z' }), { connection: CONNECTION });
    assert.equal(update.params[2], new Date(NOW).toISOString());
    assert.equal(update.params[4], true);
    assert.match(update.sql, /CLOCK_SKEW/);
  });

  it('transactionId lạ lưu orphan với payload đã che idTag và trả object rỗng', async () => {
    const queries = [];
    const warnings = [];
    const handler = createStopTransactionHandler({
      pool: {
        query: async (sql, params) => {
          queries.push({ sql, params });
          if (sql.startsWith('UPDATE charging_sessions')) return { rowCount: 0, rows: [] };
          if (sql.startsWith('SELECT charge_point_id')) return { rowCount: 0, rows: [] };
          return { rowCount: 1, rows: [] };
        },
      },
      now: () => NOW,
      logWarning: (message) => warnings.push(message),
      logError: () => {},
    });

    assert.deepEqual(await handler(validPayload({ idTag: 'SENSITIVE-TAG-1234' }), { connection: CONNECTION }), {});
    const orphan = queries.at(-1);
    assert.match(orphan.sql, /INSERT INTO orphan_messages/);
    assert.equal(orphan.params[0], 42);
    assert.equal(JSON.parse(orphan.params[1]).idTag, `${'*'.repeat('SENSITIVE-TAG-1234'.length - 4)}1234`);
    assert.equal(orphan.params[2], 'UNKNOWN_TRANSACTION');
    assert.equal(warnings.length, 1);
    assert.ok(!orphan.params[1].includes('SENSITIVE-TAG-1234'));
  });

  it('phiên đã đóng không bị cập nhật lần nữa và trụ khác ghi orphan', async () => {
    let orphanCount = 0;
    const handler = createStopTransactionHandler({
      pool: {
        query: async (sql) => {
          if (sql.startsWith('UPDATE charging_sessions')) return { rowCount: 0, rows: [] };
          if (sql.startsWith('SELECT charge_point_id')) {
            return { rowCount: 1, rows: [{ charge_point_id: '42', status: 'COMPLETED' }] };
          }
          if (sql.startsWith('INSERT INTO orphan_messages')) orphanCount += 1;
          return { rowCount: 1, rows: [] };
        },
      },
      now: () => NOW,
      logWarning: () => {},
      logError: () => {},
    });

    assert.deepEqual(await handler(validPayload(), { connection: CONNECTION }), {});
    assert.equal(orphanCount, 0);
    await handler(validPayload(), {
      connection: { ...CONNECTION, chargePoint: { ...CONNECTION.chargePoint, id: 43 } },
    });
    assert.equal(orphanCount, 1);
  });

  it('chấp nhận lý do DeAuthorized chuẩn OCPP 1.6', async () => {
    let update;
    const handler = createStopTransactionHandler({
      pool: {
        query: async (sql, params) => {
          update = { sql, params };
          return { rowCount: 1, rows: [{ meter_start: '1000' }] };
        },
      },
      now: () => NOW,
      logError: () => {},
    });

    assert.deepEqual(await handler(validPayload({ reason: 'DeAuthorized' }), { connection: CONNECTION }), {});
    assert.equal(update.params[3], 'DeAuthorized');
  });

  it('payload sai và lý do ngoài OCPP trả PropertyConstraintViolation', async () => {
    const handler = createStopTransactionHandler({ pool: { query: async () => assert.fail('không được truy vấn DB') } });
    await assert.rejects(
      () => handler(validPayload({ reason: 'Unexpected' }), { connection: CONNECTION }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
    await assert.rejects(
      () => handler(validPayload({ meterStop: -1 }), { connection: CONNECTION }),
      (error) => error instanceof OcppCallError && error.code === 'PropertyConstraintViolation'
    );
  });
});
