const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { roundHalfUp, amountDong } = require('../../src/modules/billing/money');

describe('billing/money [GYM-56]', () => {
  it('roundHalfUp làm tròn nửa lên chuẩn xác bằng số nguyên', () => {
    // 0.4 -> 0
    assert.equal(roundHalfUp(4, 10), 0);
    // 0.5 -> 1
    assert.equal(roundHalfUp(5, 10), 1);
    assert.equal(roundHalfUp(1, 2), 1);
    // 2.4 -> 2
    assert.equal(roundHalfUp(12, 5), 2);
    // 2.5 -> 3
    assert.equal(roundHalfUp(5, 2), 3);
    // 7 502.5 -> 7 503
    assert.equal(roundHalfUp(75025, 10), 7503);
  });

  it('amountDong tính tiền từ Wh và pricePerKwh làm tròn nửa lên', () => {
    // 10 000 Wh x 4 000 đ/kWh = 40 000 đ
    assert.equal(amountDong(10000, 4000), 40000);
    // 1 875 Wh x 4 001 đ/kWh = 7 501.875 -> 7 502 đ
    assert.equal(amountDong(1875, 4001), 7502);
    // 1 875 Wh x 4 002 đ/kWh = 7 503.75 -> 7 504 đ
    assert.equal(amountDong(1875, 4002), 7504);
    // Ca lẻ 7 502.5 đ -> 7 503 đ (vd: 1 500.5 Wh tương đương 3 001 Wh x 2 500 đ = 7 502 500 / 1000 = 7 502.5)
    assert.equal(amountDong(3001, 2500), 7503);
    // 0 Wh -> 0 đ
    assert.equal(amountDong(0, 4000), 0);
  });

  it('xử lý giá trị lớn không tràn số (10^7 Wh x 10^6 đ/kWh)', () => {
    const largeWh = 10_000_000; // 10 triệu Wh = 10 000 kWh
    const largePrice = 1_000_000; // 1 triệu đ/kWh
    // 10^7 x 10^6 / 10^3 = 10^10 = 10 000 000 000 đ
    assert.equal(amountDong(largeWh, largePrice), 10_000_000_000);
  });

  it('ném lỗi khi mẫu số bằng 0 hoặc số âm', () => {
    assert.throws(() => roundHalfUp(10, 0), RangeError);
    assert.throws(() => roundHalfUp(-5, 10), RangeError);
    assert.throws(() => amountDong(-1, 1000), RangeError);
  });
});
