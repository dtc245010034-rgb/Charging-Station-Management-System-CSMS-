const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { priceSession } = require('../../src/modules/billing/price-session');

const handCases = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/billing/hand-cases.json'), 'utf8')
);

describe('S-31 (GYM-57): Phiên qua nửa đêm tính đúng sang biểu giá ngày hôm sau', () => {
  it('AC1: Phiên từ 23:00 tới 01:00 qua nửa đêm với đơn giá khác nhau ở hai bên (C09)', () => {
    const c09 = handCases.find((c) => c.id === 'C09');
    assert.ok(c09, 'Cần có ca C09');

    const result = priceSession(c09.input);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].localDate, '2026-10-12');
    assert.equal(result.lines[0].amountDong, 12000);

    assert.equal(result.lines[1].localDate, '2026-10-13');
    assert.equal(result.lines[1].amountDong, 10003);

    assert.equal(result.totalDong, 22003);
  });

  it('AC1 (bổ sung): Phiên từ 23:00 tới 01:00 qua nửa đêm với cùng đơn giá hai bên (C08)', () => {
    const c08 = handCases.find((c) => c.id === 'C08');
    assert.ok(c08, 'Cần có ca C08');

    const result = priceSession(c08.input);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].localDate, '2026-10-12');
    assert.equal(result.lines[0].amountDong, 16000);

    assert.equal(result.lines[1].localDate, '2026-10-13');
    assert.equal(result.lines[1].amountDong, 16000);

    assert.equal(result.totalDong, 32000);
  });

  it('AC2: Phiên kéo dài hơn 24 giờ (33 giờ qua 2 nửa đêm, 3 ngày, 6 đoạn) nhóm theo ngày (C10)', () => {
    const c10 = handCases.find((c) => c.id === 'C10');
    assert.ok(c10, 'Cần có ca C10');

    const result = priceSession(c10.input);
    assert.equal(result.lines.length, 6, 'Phải có đúng 6 đoạn qua 3 ngày');

    // Kiểm tra localDate của 3 ngày liên tiếp
    const dates = [...new Set(result.lines.map((l) => l.localDate))];
    assert.deepEqual(dates, ['2026-10-12', '2026-10-13', '2026-10-14']);
    assert.equal(result.totalDong, 334500);
  });

  it('NFR: Cắt nửa đêm và ranh giới theo múi giờ trạm khác UTC+7 như Asia/Kolkata (C16)', () => {
    const c16 = handCases.find((c) => c.id === 'C16');
    assert.ok(c16, 'Cần có ca C16');

    const result = priceSession(c16.input);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].amountDong, 18617);
    assert.equal(result.lines[1].amountDong, 10636);
    assert.equal(result.totalDong, 29253);
  });
});
