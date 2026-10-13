const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { priceSession } = require('../../src/modules/billing/price-session');

const handCases = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/billing/hand-cases.json'), 'utf8')
);

describe('S-32 (GYM-58): Bộ ca kiểm thử tính tiền có đáp án tính tay', () => {
  it('AC1: Bảng ca kiểm thử có ít nhất 12 ca và đủ các loại ca (một khung, cắt biên, qua 0h, chiếm trụ, mẫu thưa)', () => {
    assert.ok(handCases.length >= 12, `Số ca tính tay phải >= 12 (thực tế: ${handCases.length})`);

    // Kiểm tra có ca một khung (C01)
    assert.ok(handCases.some((c) => c.id === 'C01'));
    // Kiểm tra có ca cắt ranh giới (C03)
    assert.ok(handCases.some((c) => c.id === 'C03'));
    // Kiểm tra có ca qua 0h (C08, C09, C10)
    assert.ok(handCases.some((c) => c.id === 'C08'));
    // Kiểm tra có ca phí chiếm trụ (C13, C14, C15)
    assert.ok(handCases.some((c) => c.id === 'C14'));
    // Kiểm tra có ca mẫu thưa (C03, C11)
    assert.ok(handCases.some((c) => c.id === 'C11'));
  });

  for (const tc of handCases) {
    it(`AC1 & AC2: Ca ${tc.id} (${tc.description}) khớp đáp án tính tay từng đồng`, () => {
      const result = priceSession(tc.input);

      // So khớp từng dòng và in chi tiết nếu lệch: Ca Cxx · đoạn i (from-to): lệch +x đồng (mong đợi y, nhận z)
      for (let i = 0; i < tc.expected.lines.length; i++) {
        const expLine = tc.expected.lines[i];
        const actLine = result.lines[i];

        assert.ok(actLine, `Ca ${tc.id} thiếu dòng thứ ${i + 1}`);

        if (actLine.amountDong !== expLine.amountDong) {
          const diff = actLine.amountDong - expLine.amountDong;
          const sign = diff > 0 ? `+${diff}` : `${diff}`;
          assert.fail(
            `Ca ${tc.id} · đoạn ${i + 1} (${expLine.from}–${expLine.to}): lệch ${sign} đồng (mong đợi ${expLine.amountDong}, nhận ${actLine.amountDong})`
          );
        }

        assert.equal(actLine.wh, expLine.wh, `Ca ${tc.id} · đoạn ${i + 1}: Wh không khớp`);
        assert.equal(Date.parse(actLine.from), Date.parse(expLine.from));
        assert.equal(Date.parse(actLine.to), Date.parse(expLine.to));
      }

      if (result.totalDong !== tc.expected.totalDong) {
        const diff = result.totalDong - tc.expected.totalDong;
        const sign = diff > 0 ? `+${diff}` : `${diff}`;
        assert.fail(
          `Ca ${tc.id}: tổng tiền lệch ${sign} đồng (mong đợi ${tc.expected.totalDong}, nhận ${result.totalDong})`
        );
      }
    });
  }
});
