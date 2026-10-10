const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validatePayload } = require('../../src/modules/ocpp/handlers/meter-values');

const payloadWith = (sampledValue) => ({
  connectorId: 1,
  transactionId: 1,
  meterValue: [{ timestamp: new Date().toISOString(), sampledValue }],
});

describe('ocpp meter-values: SoC', () => {
  it('SoC hợp lệ được giữ lại', () => {
    const readings = validatePayload(payloadWith([{ measurand: 'SoC', value: '55', unit: 'Percent' }]));
    assert.deepEqual(readings.map((r) => [r.measurand, r.value]), [['SoC', '55']]);
  });

  it('SoC thiếu đơn vị dùng mặc định Percent', () => {
    const readings = validatePayload(payloadWith([{ measurand: 'SoC', value: '55' }]));
    assert.equal(readings[0].unit, 'Percent');
  });

  it('SoC ngoài 0–100 bị bỏ riêng, Energy cùng bản tin vẫn được giữ, không ném lỗi', () => {
    const readings = validatePayload(payloadWith([
      { measurand: 'Energy.Active.Import.Register', value: '15500', unit: 'Wh' },
      { measurand: 'SoC', value: '150', unit: 'Percent' },
    ]));
    assert.deepEqual(readings.map((r) => r.measurand), ['Energy.Active.Import.Register']);
  });

  it('measurand khác chưa hỗ trợ (Voltage) vẫn bị bỏ qua', () => {
    const readings = validatePayload(payloadWith([{ measurand: 'Voltage', value: '230', unit: 'V' }]));
    assert.equal(readings.length, 0);
  });

  it('Energy sai ngưỡng vẫn ném lỗi như cũ', () => {
    assert.throws(() => validatePayload(payloadWith([
      { measurand: 'Energy.Active.Import.Register', value: '-5', unit: 'Wh' },
    ])), /plausible/);
  });
});
