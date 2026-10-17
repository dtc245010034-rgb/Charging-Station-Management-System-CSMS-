const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { percentile, backoffDelay, parseArgs, SCENARIOS } = require('../../../tools/lib/fleet-stats');
const { parseOptions, ManagedChargePoint } = require('../../../tools/vcp-fleet');

describe('tools/simulate-fleet: phần thuần', () => {
  it('percentile theo nearest-rank', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    assert.equal(percentile(values, 50), 50);
    assert.equal(percentile(values, 95), 95);
    assert.equal(percentile(values, 99), 99);
    assert.equal(percentile([30, 10, 20], 100), 30);
    assert.equal(percentile([7], 95), 7);
    assert.equal(percentile([], 95), null);
  });

  it('backoffDelay tăng gấp đôi, có trần và có jitter trong [0.5, 1]', () => {
    assert.equal(backoffDelay(0, () => 1), 200);
    assert.equal(backoffDelay(1, () => 1), 400);
    assert.equal(backoffDelay(10, () => 1), 5000);
    assert.equal(backoffDelay(2, () => 0), 400);
  });

  it('parseArgs: mặc định, ghi đè, và từ chối đầu vào sai', () => {
    const defaults = parseArgs([]);
    assert.equal(defaults.count, 50);
    assert.equal(defaults.prefix, 'SIM-');
    assert.deepEqual(defaults.scenarios, SCENARIOS);
    assert.equal(defaults.counterIds, false);
    const custom = parseArgs(['--count', '20', '--prefix', 'abc-', '--scenario', 'load,lock', '--counter-ids', '--duration', '10']);
    assert.deepEqual([custom.count, custom.prefix, custom.scenarios, custom.counterIds, custom.duration], [20, 'ABC-', ['load', 'lock'], true, 10]);
    assert.throws(() => parseArgs(['--count', '0']), /số nguyên dương/);
    assert.throws(() => parseArgs(['--count', '3']), /tối thiểu 5/);
    assert.throws(() => parseArgs(['--scenario', 'nope']), /không có/);
    assert.throws(() => parseArgs(['--bogus', '1']), /không hợp lệ/);
    assert.throws(() => parseArgs(['--url']), /Thiếu giá trị/);
  });
});

describe('tools/vcp-fleet: ChangeConfiguration và GetConfiguration', () => {
  function sendRequest(chargePoint, action, payload) {
    const sent = [];
    chargePoint.socket = { send: (message) => sent.push(JSON.parse(message)) };
    chargePoint.handleMessage(Buffer.from(JSON.stringify([2, 'request-1', action, payload])));
    return sent[0];
  }

  it('đọc các khóa cấu hình và liệt kê khóa không biết', () => {
    const chargePoint = new ManagedChargePoint('VCP-TEST', 'ws://localhost', 60);
    const response = sendRequest(chargePoint, 'GetConfiguration', {
      key: ['HeartbeatInterval', 'MeterValueSampleInterval', 'UnknownKey'],
    });

    assert.deepStrictEqual(response, [
      3,
      'request-1',
      {
        configurationKey: [
          { key: 'HeartbeatInterval', value: '60', readonly: false },
          { key: 'MeterValueSampleInterval', value: '10', readonly: false },
        ],
        unknownKey: ['UnknownKey'],
      },
    ]);
  });

  it('chấp nhận giá trị hợp lệ, từ chối giá trị ngoài phạm vi và không hỗ trợ khóa lạ', () => {
    const chargePoint = new ManagedChargePoint('VCP-TEST', 'ws://localhost', 60);

    assert.deepStrictEqual(sendRequest(chargePoint, 'ChangeConfiguration', {
      key: 'HeartbeatInterval',
      value: '45',
    })[2], { status: 'Accepted' });
    assert.equal(chargePoint.heartbeatInterval, 45);
    assert.deepStrictEqual(sendRequest(chargePoint, 'ChangeConfiguration', {
      key: 'HeartbeatInterval',
      value: '9',
    })[2], { status: 'Rejected' });
    assert.deepStrictEqual(sendRequest(chargePoint, 'ChangeConfiguration', {
      key: 'UnsupportedKey',
      value: '1',
    })[2], { status: 'NotSupported' });
  });

  it('có thể cấu hình một khóa trả RebootRequired', () => {
    const chargePoint = new ManagedChargePoint('VCP-TEST', 'ws://localhost', 60, 'Accepted', {
      rebootRequiredKey: 'MeterValueSampleInterval',
    });

    assert.deepStrictEqual(sendRequest(chargePoint, 'ChangeConfiguration', {
      key: 'MeterValueSampleInterval',
      value: '30',
    })[2], { status: 'RebootRequired' });
    const response = sendRequest(chargePoint, 'GetConfiguration', {
      key: ['MeterValueSampleInterval'],
    });
    assert.deepStrictEqual(response[2].configurationKey, [
      { key: 'MeterValueSampleInterval', value: '30', readonly: false },
    ]);
  });

  it('cho phép chọn khóa RebootRequired qua tùy chọn dòng lệnh hoặc môi trường', () => {
    const env = { ADMIN_EMAIL: 'user@example.invalid', ADMIN_PASSWORD: 'test-password' };
    assert.equal(
      parseOptions(['--reboot-required-key', 'HeartbeatInterval'], env).rebootRequiredKey,
      'HeartbeatInterval'
    );
    assert.equal(
      parseOptions([], { ...env, VCP_REBOOT_REQUIRED_KEY: 'MeterValueSampleInterval' }).rebootRequiredKey,
      'MeterValueSampleInterval'
    );
    assert.throws(
      () => parseOptions(['--reboot-required-key', 'UnsupportedKey'], env),
      /khóa cấu hình/
    );
    assert.equal(parseOptions(['--reservation-result', 'Faulted'], env).reservationResult, 'Faulted');
    assert.equal(parseOptions([], { ...env, VCP_RESERVATION_RESULT: 'Unavailable' }).reservationResult, 'Unavailable');
    assert.throws(() => parseOptions(['--reservation-result', 'Unknown'], env), /reservation result/);
  });
});

describe('tools/vcp-fleet: ReserveNow và CancelReservation', () => {
  function createSocket(chargePoint) {
    const socket = new EventEmitter();
    socket.sent = [];
    socket.readyState = 1;
    socket.send = (message) => {
      const frame = JSON.parse(message);
      socket.sent.push(frame);
      if (frame[0] === 2) {
        const result = frame[2] === 'StartTransaction'
          ? { transactionId: 301, idTagInfo: { status: 'Accepted' } }
          : { status: 'Accepted' };
        setImmediate(() => socket.emit('message', Buffer.from(JSON.stringify([3, frame[1], result]))));
      }
    };
    chargePoint.socket = socket;
    return socket;
  }

  it('accepts a free connector, reports Reserved, returns Occupied while charging, then cancels', async () => {
    const chargePoint = new ManagedChargePoint('VCP-RESERVE', 'ws://localhost', 60);
    const socket = createSocket(chargePoint);
    chargePoint.handleMessage(Buffer.from(JSON.stringify([2, 'reserve-1', 'ReserveNow', {
      connectorId: 1,
      expiryDate: new Date(Date.now() + 3600000).toISOString(),
      idTag: 'TAG-RESERVE',
      reservationId: 41,
    }])));
    assert.deepStrictEqual(socket.sent[0], [3, 'reserve-1', { status: 'Accepted' }]);
    await new Promise((resolve) => setImmediate(resolve));
    const statusCall = socket.sent.find((frame) => frame[0] === 2 && frame[2] === 'StatusNotification');
    assert.equal(statusCall[3].connectorId, 1);
    assert.equal(statusCall[3].status, 'Reserved');
    assert.equal(chargePoint.currentReservation.reservationId, 41);

    chargePoint.currentTransactionId = 300;
    chargePoint.currentConnectorId = 1;
    chargePoint.handleMessage(Buffer.from(JSON.stringify([2, 'reserve-occupied', 'ReserveNow', {
      connectorId: 1,
      expiryDate: new Date(Date.now() + 3600000).toISOString(),
      idTag: 'TAG-OTHER',
      reservationId: 42,
    }])));
    assert.deepStrictEqual(socket.sent.at(-1), [3, 'reserve-occupied', { status: 'Occupied' }]);

    chargePoint.currentTransactionId = null;
    chargePoint.handleMessage(Buffer.from(JSON.stringify([2, 'cancel-1', 'CancelReservation', { reservationId: 41 }])));
    assert.deepStrictEqual(socket.sent.find((frame) => frame[0] === 3 && frame[1] === 'cancel-1'), [3, 'cancel-1', { status: 'Accepted' }]);
    assert.equal(chargePoint.currentReservation, null);
  });

  it('can force Faulted, Unavailable and Rejected responses for ReserveNow', () => {
    for (const status of ['Faulted', 'Unavailable', 'Rejected']) {
      const chargePoint = new ManagedChargePoint('VCP-RESERVE', 'ws://localhost', 60, 'Accepted', {
        reservationResult: status,
      });
      const socket = createSocket(chargePoint);
      chargePoint.handleMessage(Buffer.from(JSON.stringify([2, `reserve-${status}`, 'ReserveNow', {
        connectorId: 1,
        expiryDate: new Date(Date.now() + 3600000).toISOString(),
        idTag: 'TAG-RESERVE',
        reservationId: 41,
      }])));
      assert.deepStrictEqual(socket.sent[0], [3, `reserve-${status}`, { status }]);
      assert.equal(chargePoint.currentReservation, null);
      assert.equal(socket.sent.some((frame) => frame[0] === 2 && frame[2] === 'StatusNotification'), false);
    }
  });

  it('sends a matching reservationId in StartTransaction and releases simulator hold', async () => {
    const chargePoint = new ManagedChargePoint('VCP-RESERVE', 'ws://localhost', 60);
    const socket = createSocket(chargePoint);
    chargePoint.currentReservation = {
      connectorId: 1,
      expiryDate: new Date(Date.now() + 3600000).toISOString(),
      idTag: 'TAG-RESERVE',
      reservationId: 41,
    };
    chargePoint.handleMessage(Buffer.from(JSON.stringify([2, 'remote-start-reserved', 'RemoteStartTransaction', {
      connectorId: 1,
      idTag: 'TAG-RESERVE',
    }])));
    await new Promise((resolve) => setTimeout(resolve, 150));
    const start = socket.sent.find((frame) => frame[0] === 2 && frame[2] === 'StartTransaction');
    assert.equal(start[3].reservationId, 41);
    assert.equal(chargePoint.currentReservation, null);
    await chargePoint.shutdown();
  });
});
