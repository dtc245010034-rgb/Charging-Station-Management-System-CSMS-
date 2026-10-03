const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  OCPP_CONNECTOR_STATUS_MAP,
  UNKNOWN_CONNECTOR_STATUS,
  mapOcppConnectorStatus,
} = require('../../src/modules/connectors/status-mapping');
const { createStatusNotificationHandler } = require('../../src/modules/ocpp/handlers/status-notification');

describe('OCPP connector status mapping', () => {
  it('maps all nine OCPP statuses to internal statuses (Unavailable is UNAVAILABLE, not ERROR)', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(OCPP_CONNECTOR_STATUS_MAP)), {
      Available: 'AVAILABLE',
      Preparing: 'OCCUPIED',
      Charging: 'OCCUPIED',
      SuspendedEV: 'OCCUPIED',
      SuspendedEVSE: 'OCCUPIED',
      Finishing: 'OCCUPIED',
      Reserved: 'RESERVED',
      Unavailable: 'UNAVAILABLE',
      Faulted: 'ERROR',
    });
  });

  it('maps unknown status strings to ERROR safely', () => {
    assert.equal(mapOcppConnectorStatus('VendorSpecificState'), UNKNOWN_CONNECTOR_STATUS);
    assert.equal(mapOcppConnectorStatus('__proto__'), UNKNOWN_CONNECTOR_STATUS);
  });
});

describe('StatusNotification handler', () => {
  it('updates connector state while retaining the original OCPP status', async () => {
    const queries = [];
    const handler = createStatusNotificationHandler({
      pool: { query: async (sql, params) => { queries.push({ sql, params }); return { rowCount: 1 }; } },
    });
    assert.deepEqual(await handler(
      { connectorId: 2, status: 'Charging' },
      { connection: { chargePointCode: 'CP-TEST' } }
    ), {});
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /UPDATE connectors/);
    assert.deepEqual(queries[0].params, ['OCCUPIED', 'Charging', 'CP-TEST', 2]);
  });

  it('stores unknown statuses verbatim and acknowledges them', async () => {
    let params;
    const handler = createStatusNotificationHandler({
      pool: { query: async (_sql, values) => { params = values; return { rowCount: 1 }; } },
      logWarning: () => {},
    });
    assert.deepEqual(await handler(
      { connectorId: 1, status: 'VendorSpecificState' },
      { connection: { chargePoint: { code: 'CP-TEST' } } }
    ), {});
    assert.deepEqual(params, ['ERROR', 'VendorSpecificState', 'CP-TEST', 1]);
  });

  it('appends error code, vendor code, and reported time for connector errors', async () => {
    const queries = [];
    const handler = createStatusNotificationHandler({
      pool: { query: async (sql, params) => { queries.push({ sql, params }); return { rowCount: 1 }; } },
    });
    await handler({
      connectorId: 1,
      status: 'Faulted',
      errorCode: 'GroundFailure',
      vendorErrorCode: 'VENDOR-42',
      timestamp: '2026-10-03T04:00:00.000Z',
    }, { connection: { chargePointCode: 'CP-TEST' } });
    assert.equal(queries.length, 2);
    assert.match(queries[1].sql, /INSERT INTO connector_errors/);
    assert.deepEqual(queries[1].params, ['GroundFailure', 'VENDOR-42', '2026-10-03T04:00:00.000Z', 'CP-TEST', 1, 60, false]);
  });

  it('does not append NoError or delete existing error history', async () => {
    const history = [{ error_code: 'GroundFailure' }];
    const handler = createStatusNotificationHandler({
      pool: {
        query: async (sql, params) => {
          if (sql.includes('INSERT INTO connector_errors')) history.push({ error_code: params[0] });
          return { rowCount: 1 };
        },
      },
    });
    await handler({ connectorId: 1, status: 'Available', errorCode: 'NoError' }, { connection: { chargePointCode: 'CP-TEST' } });
    assert.deepEqual(history, [{ error_code: 'GroundFailure' }]);
  });

  it('does not update the database for connectorId 0', async () => {
    let called = false;
    const handler = createStatusNotificationHandler({
      pool: { query: async () => { called = true; return { rowCount: 1 }; } },
    });
    assert.deepEqual(await handler({ connectorId: 0, status: 'Available' }), {});
    assert.equal(called, false);
  });

  it('ignores undeclared connectors and rate-limits warnings per charge point', async () => {
    const queries = [];
    const warnings = [];
    let currentTime = 1000;
    const handler = createStatusNotificationHandler({
      pool: { query: async (sql, params) => { queries.push({ sql, params }); return { rowCount: 0 }; } },
      logWarning: (message) => warnings.push(message),
      now: () => currentTime,
    });
    for (let index = 0; index < 5; index += 1) {
      assert.deepEqual(await handler(
        { connectorId: 3, status: 'Faulted', errorCode: 'GroundFailure' },
        { connection: { chargePointCode: 'CP-TWO-CONNECTORS' } }
      ), {});
    }
    assert.equal(queries.length, 5);
    assert.ok(queries.every(({ sql }) => sql.includes('UPDATE connectors')));
    assert.equal(queries.filter(({ sql }) => sql.includes('INSERT INTO connector_errors')).length, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /CP-TWO-CONNECTORS/);
    assert.match(warnings[0], /connectorId: 3/);

    currentTime += 60000;
    await handler(
      { connectorId: 3, status: 'Faulted', errorCode: 'GroundFailure' },
      { connection: { chargePointCode: 'CP-TWO-CONNECTORS' } }
    );
    assert.equal(warnings.length, 2);
  });

  it('reports database failures as OCPP InternalError', async () => {
    const handler = createStatusNotificationHandler({
      pool: { query: async () => { throw new Error('database unavailable'); } },
      logError: () => {},
    });
    await assert.rejects(
      handler({ connectorId: 1, status: 'Available' }, { connection: { chargePointCode: 'CP-TEST' } }),
      (error) => error.code === 'InternalError'
    );
  });
});

const longText = (length) => 'x'.repeat(length);
const OCPP_ERROR_CODES = [
  'ConnectorLockFailure', 'EVCommunicationError', 'GroundFailure', 'HighTemperature', 'InternalError', 'LocalListConflict',
  'NoError', 'OtherError', 'OverCurrentFailure', 'PowerMeterFailure', 'PowerSwitchFailure', 'ReaderFailure', 'ResetFailure',
  'UnderVoltage', 'OverVoltage', 'WeakSignal',
];

function recordingHandler(options = {}) {
  const queries = [];
  const warnings = [];
  const infos = [];
  const handler = createStatusNotificationHandler({
    pool: { query: async (sql, params) => { queries.push({ sql, params }); return { rowCount: 1, rows: [] }; } },
    logWarning: (message) => warnings.push(message),
    logInfo: (message) => infos.push(message),
    ...options,
  });
  const call = (payload) => handler(payload, { connection: { chargePointCode: 'CP-TEST' } });
  return { call, queries, warnings, infos };
}

describe('F1: StatusNotification giới hạn độ dài và danh sách mã lỗi', () => {
  it('từ chối status dài hơn 50 ký tự, không chạm DB', async () => {
    const { call, queries } = recordingHandler();
    await assert.rejects(call({ connectorId: 1, status: longText(5000) }), (error) => error.code === 'PropertyConstraintViolation');
    assert.equal(queries.length, 0);
  });

  it('nhận status đúng 50 ký tự', async () => {
    const { call, queries } = recordingHandler();
    assert.deepEqual(await call({ connectorId: 1, status: longText(50) }), {});
    assert.equal(queries[0].params[1], longText(50));
  });

  for (const field of ['errorCode', 'vendorErrorCode', 'info', 'vendorId']) {
    it(`từ chối ${field} dài hơn 50 ký tự, không chạm DB`, async () => {
      const { call, queries } = recordingHandler();
      await assert.rejects(
        call({ connectorId: 1, status: 'Faulted', errorCode: 'GroundFailure', [field]: longText(51) }),
        (error) => error.code === 'PropertyConstraintViolation'
      );
      assert.equal(queries.length, 0);
    });
  }

  it('từ chối errorCode không phải chuỗi', async () => {
    const { call } = recordingHandler();
    await assert.rejects(call({ connectorId: 1, status: 'Faulted', errorCode: 42 }), (error) => error.code === 'PropertyConstraintViolation');
  });

  it('từ chối connectorId vượt phạm vi số nguyên 32 bit thay vì để DB báo lỗi', async () => {
    const { call, queries } = recordingHandler();
    await assert.rejects(call({ connectorId: 2 ** 40, status: 'Available' }), (error) => error.code === 'PropertyConstraintViolation');
    assert.equal(queries.length, 0);
  });

  it('giữ nguyên cả 16 mã lỗi OCPP 1.6 (trừ NoError không ghi dòng)', async () => {
    for (const errorCode of OCPP_ERROR_CODES.filter((code) => code !== 'NoError')) {
      const { call, queries } = recordingHandler();
      await call({ connectorId: 1, status: 'Faulted', errorCode });
      assert.equal(queries[1].params[0], errorCode, errorCode);
    }
  });

  it('errorCode ngoài danh sách (<= 50 ký tự): lưu OtherError, giữ nguyên văn trong vendor_error_code và cảnh báo', async () => {
    const { call, queries, warnings } = recordingHandler();
    await call({ connectorId: 1, status: 'Faulted', errorCode: 'MyCustomFault' });
    assert.equal(queries[1].params[0], 'OtherError');
    assert.equal(queries[1].params[1], 'MyCustomFault');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /MyCustomFault/);
  });

  it('errorCode ngoài danh sách kèm vendorErrorCode: lưu OtherError, giữ vendorErrorCode, nguyên văn errorCode nằm trong log', async () => {
    const { call, queries, warnings } = recordingHandler();
    await call({ connectorId: 1, status: 'Faulted', errorCode: 'MyCustomFault', vendorErrorCode: 'V-1' });
    assert.equal(queries[1].params[0], 'OtherError');
    assert.equal(queries[1].params[1], 'V-1');
    assert.match(warnings[0], /MyCustomFault/);
  });

  it('status lạ: làm sạch ký tự điều khiển (kể cả NUL) trước khi lưu và gom cảnh báo theo trụ', async () => {
    let currentTime = 1000;
    const { call, queries, warnings } = recordingHandler({ now: () => currentTime });
    for (let index = 0; index < 5; index += 1) await call({ connectorId: 1, status: `Vendor\u0000State${index}\n` });
    assert.equal(queries.length, 5);
    assert.equal(queries[0].params[1], 'VendorState0');
    assert.equal(warnings.length, 1);
    currentTime += 60000;
    await call({ connectorId: 1, status: 'VendorX' });
    assert.equal(warnings.length, 2);
  });

  it('status chỉ gồm ký tự điều khiển bị từ chối', async () => {
    const { call, queries } = recordingHandler();
    await assert.rejects(call({ connectorId: 1, status: '\u0000\u0001' }), (error) => error.code === 'PropertyConstraintViolation');
    assert.equal(queries.length, 0);
  });
});

describe('F4: Unavailable là tạm ngừng khai thác, không phải sự cố', () => {
  it('ghi UNAVAILABLE và giữ ocpp_status gốc', async () => {
    const { call, queries } = recordingHandler();
    await call({ connectorId: 1, status: 'Unavailable' });
    assert.deepEqual(queries[0].params, ['UNAVAILABLE', 'Unavailable', 'CP-TEST', 1]);
  });

  it('trạng thái OCPP lạ vẫn ánh xạ ERROR', async () => {
    const { call, queries } = recordingHandler();
    await call({ connectorId: 1, status: 'VendorSpecificState' });
    assert.equal(queries[0].params[0], 'ERROR');
  });
});

describe('F5: connectorId = 0 (trạng thái cả trụ)', () => {
  it('trả {} không chạm DB và ghi info có gom theo trụ', async () => {
    let currentTime = 1000;
    const { call, queries, infos } = recordingHandler({ now: () => currentTime });
    for (let index = 0; index < 5; index += 1) assert.deepEqual(await call({ connectorId: 0, status: 'Available' }), {});
    assert.equal(queries.length, 0);
    assert.equal(infos.length, 1);
    assert.match(infos[0], /CP-TEST/);
    currentTime += 60000;
    await call({ connectorId: 0, status: 'Faulted' });
    assert.equal(infos.length, 2);
  });
});
