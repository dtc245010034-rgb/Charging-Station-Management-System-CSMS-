const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { priceSession } = require('../../src/modules/billing/price-session');

const handCases = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/billing/hand-cases.json'), 'utf8')
);

describe('S-30 (GYM-56): Phiên cắt qua nhiều khung giờ được chia đoạn và tính đúng từng đoạn', () => {
  it('AC1: Phiên bắt đầu 21:30 kết thúc 23:30 cắt lúc 22:00 → chia 2 đoạn, nội suy tuyến tính mẫu thưa (C03)', () => {
    const c03 = handCases.find((c) => c.id === 'C03');
    assert.ok(c03, 'Cần có ca C03 trong hand-cases.json');

    const result = priceSession(c03.input);
    assert.equal(result.lines.length, 2, 'Phiên phải được chia làm 2 đoạn');
    assert.equal(result.lines[0].amountDong, 18004);
    assert.equal(result.lines[1].amountDong, 40497);
    assert.equal(result.totalDong, 58501);
  });

  it('AC1 (bổ sung): Mẫu đúng mốc biên 22:00 thì dùng trực tiếp mẫu không cần nội suy (C04)', () => {
    const c04 = handCases.find((c) => c.id === 'C04');
    assert.ok(c04, 'Cần có ca C04 trong hand-cases.json');

    const result = priceSession(c04.input);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].wh, 3333);
    assert.equal(result.lines[1].wh, 2667);
    assert.equal(result.totalDong, 21333);
  });

  it('AC2: Phiên nằm trọn trong một khung → chỉ có 1 đoạn và tổng bằng kWh nhân đơn giá (C01)', () => {
    const c01 = handCases.find((c) => c.id === 'C01');
    assert.ok(c01, 'Cần có ca C01 trong hand-cases.json');

    const result = priceSession(c01.input);
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines[0].amountDong, 40000);
    assert.equal(result.totalDong, 40000);
  });

  it('AC3: Làm tròn từng đoạn rồi cộng ≠ làm tròn cả phiên; ghi rõ roundingRule là PER_SEGMENT_HALF_UP (C12)', () => {
    const c12 = handCases.find((c) => c.id === 'C12');
    assert.ok(c12, 'Cần có ca C12 trong hand-cases.json');

    const result = priceSession(c12.input);
    assert.equal(result.roundingRule, 'PER_SEGMENT_HALF_UP');
    assert.equal(result.lines.length, 2);
    // Đoạn 1: 2333 đ, Đoạn 2: 2999 đ -> Tổng = 5332 đ (nếu tính gộp cả phiên làm tròn thì ra 5333 đ)
    assert.equal(result.lines[0].amountDong, 2333);
    assert.equal(result.lines[1].amountDong, 2999);
    assert.equal(result.totalDong, 5332);
  });
});
