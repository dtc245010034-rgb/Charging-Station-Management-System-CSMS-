const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { liveEnergyKwh, powerToWatts, toNumberOrNull } = require('../../src/modules/sessions/readings');

describe('readings: đổi số đo mới nhất sang đơn vị hiển thị', () => {
  describe('liveEnergyKwh(meterStartWh, value, unit)', () => {
    it('Wh nguyên: 15400 Wh, bắt đầu 10000 Wh -> 5.4 kWh', () => {
      assert.equal(liveEnergyKwh(10000, '15400', 'Wh'), 5.4);
    });

    it('Wh thập phân: 15500.5 Wh, bắt đầu 10000 Wh -> 5.5005 kWh', () => {
      assert.equal(liveEnergyKwh(10000, '15500.5', 'Wh'), 5.5005);
    });

    it('kWh nguyên: 16 kWh, bắt đầu 10000 Wh -> 6 kWh', () => {
      assert.equal(liveEnergyKwh(10000, '16', 'kWh'), 6);
    });

    it('kWh thập phân: 15.5 kWh, bắt đầu 10000 Wh -> 5.5 kWh', () => {
      assert.equal(liveEnergyKwh(10000, '15.5', 'kWh'), 5.5);
    });

    it('đơn vị không phân biệt hoa thường và khoảng trắng', () => {
      assert.equal(liveEnergyKwh(10000, '16', ' KWH '), 6);
      assert.equal(liveEnergyKwh(10000, '15500', 'wh'), 5.5);
    });

    it('thiếu đơn vị thì mặc định Wh', () => {
      assert.equal(liveEnergyKwh(10000, '15500', undefined), 5.5);
      assert.equal(liveEnergyKwh(10000, '15500', null), 5.5);
    });

    it('số đo nhỏ hơn mốc bắt đầu -> null (không âm)', () => {
      assert.equal(liveEnergyKwh(10000, '9999', 'Wh'), null);
    });

    it('số đo bằng mốc bắt đầu -> 0', () => {
      assert.equal(liveEnergyKwh(10000, '10000', 'Wh'), 0);
    });

    it('đơn vị lạ -> null, không đoán', () => {
      assert.equal(liveEnergyKwh(10000, '16', 'MWh'), null);
    });

    it('giá trị không phải số hoặc rỗng -> null, không ném lỗi', () => {
      assert.equal(liveEnergyKwh(10000, 'abc', 'Wh'), null);
      assert.equal(liveEnergyKwh(10000, '', 'Wh'), null);
      assert.equal(liveEnergyKwh(10000, null, 'Wh'), null);
      assert.equal(liveEnergyKwh(10000, undefined, 'Wh'), null);
    });

    it('mốc bắt đầu thiếu -> null', () => {
      assert.equal(liveEnergyKwh(null, '15500', 'Wh'), null);
    });

    it('ký hiệu mũ: 1.55e4 Wh, bắt đầu 10000 Wh -> 5.5 kWh', () => {
      assert.equal(liveEnergyKwh(10000, '1.55e4', 'Wh'), 5.5);
    });

    it('số rất lớn nhưng hợp lệ không mất độ chính xác: 999999999 kWh, bắt đầu 0', () => {
      assert.equal(liveEnergyKwh(0, '999999999', 'kWh'), 999999999);
    });
  });

  describe('powerToWatts(value, unit)', () => {
    it('W nguyên giữ nguyên', () => {
      assert.equal(powerToWatts('3680', 'W'), 3680);
    });

    it('W thập phân giữ phần lẻ: 3680.5 W', () => {
      assert.equal(powerToWatts('3680.5', 'W'), 3680.5);
    });

    it('kW đổi sang W: 7.2 kW -> 7200 W', () => {
      assert.equal(powerToWatts('7.2', 'kW'), 7200);
      assert.equal(powerToWatts('3.68', 'kW'), 3680);
    });

    it('thiếu đơn vị thì mặc định W', () => {
      assert.equal(powerToWatts('400', undefined), 400);
    });

    it('đơn vị lạ hoặc giá trị hỏng -> null', () => {
      assert.equal(powerToWatts('5', 'MW'), null);
      assert.equal(powerToWatts('abc', 'W'), null);
      assert.equal(powerToWatts(null, 'W'), null);
    });
  });

  describe('toNumberOrNull(value)', () => {
    it('chuỗi số -> số', () => {
      assert.equal(toNumberOrNull('32'), 32);
      assert.equal(toNumberOrNull('55.5'), 55.5);
    });

    it('null / undefined / không phải số -> null', () => {
      assert.equal(toNumberOrNull(null), null);
      assert.equal(toNumberOrNull(undefined), null);
      assert.equal(toNumberOrNull('x'), null);
    });
  });
});
