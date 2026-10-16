const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
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
  });
});
