const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { priceSession } = require('../../src/modules/billing/price-session');

const handCases = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/billing/hand-cases.json'), 'utf8')
);

describe('S-32 / GYM-58: Bộ 17 ca tính tiền khớp đáp án tính tay', () => {
  it('bộ ca kiểm thử có ít nhất 12 ca và có ca trạm múi giờ khác UTC+7 (C16)', () => {
    assert.ok(handCases.length >= 12, `Số ca tính tay phải >= 12 (thực tế: ${handCases.length})`);
    const c16 = handCases.find((c) => c.id === 'C16');
    assert.ok(c16, 'Phải có ca C16');
    assert.notEqual(c16.input.timezone, 'Asia/Ho_Chi_Minh', 'Ca C16 phải dùng múi giờ khác UTC+7');
  });

  for (const tc of handCases) {
    it(`khớp từng đồng ca ${tc.id}: ${tc.description}`, () => {
      const result = priceSession(tc.input);

      // So sánh cấu trúc lines
      assert.equal(
        result.lines.length,
        tc.expected.lines.length,
        `Ca ${tc.id}: số dòng lines khác nhau (mong đợi ${tc.expected.lines.length}, nhận ${result.lines.length})`
      );

      for (let i = 0; i < tc.expected.lines.length; i++) {
        const expLine = tc.expected.lines[i];
        const actLine = result.lines[i];

        // So thời điểm theo instant (Date.parse), không so chuỗi thô
        assert.equal(
          Date.parse(actLine.from),
          Date.parse(expLine.from),
          `Ca ${tc.id} · dòng ${i + 1}: thời điểm from lệch (mong đợi ${expLine.from}, nhận ${actLine.from})`
        );
        assert.equal(
          Date.parse(actLine.to),
          Date.parse(expLine.to),
          `Ca ${tc.id} · dòng ${i + 1}: thời điểm to lệch (mong đợi ${expLine.to}, nhận ${actLine.to})`
        );

        assert.equal(actLine.kind, expLine.kind, `Ca ${tc.id} · dòng ${i + 1}: kind lệch`);
        assert.equal(actLine.localDate, expLine.localDate, `Ca ${tc.id} · dòng ${i + 1}: localDate lệch`);
        assert.equal(actLine.wh, expLine.wh, `Ca ${tc.id} · dòng ${i + 1}: Wh lệch`);
        assert.equal(actLine.pricePerKwh, expLine.pricePerKwh, `Ca ${tc.id} · dòng ${i + 1}: đơn giá lệch`);

        if (expLine.kind === 'IDLE') {
          assert.equal(actLine.minutes, expLine.minutes, `Ca ${tc.id} · dòng ${i + 1}: số phút IDLE lệch`);
          assert.equal(actLine.perMinDong, expLine.perMinDong, `Ca ${tc.id} · dòng ${i + 1}: đơn giá IDLE lệch`);
        }

        // Kiểm tra tiền từng dòng, nếu sai thông báo rõ: Ca Cxx · đoạn i (from-to): lệch +x đồng (mong đợi y, nhận z)
        if (actLine.amountDong !== expLine.amountDong) {
          const diff = actLine.amountDong - expLine.amountDong;
          const sign = diff > 0 ? `+${diff}` : `${diff}`;
          assert.fail(
            `Ca ${tc.id} · đoạn ${i + 1} (${expLine.from}–${expLine.to}): lệch ${sign} đồng (mong đợi ${expLine.amountDong}, nhận ${actLine.amountDong})`
          );
        }
      }

      // Kiểm tra tổng tiền
      if (result.totalDong !== tc.expected.totalDong) {
        const diff = result.totalDong - tc.expected.totalDong;
        const sign = diff > 0 ? `+${diff}` : `${diff}`;
        assert.fail(
          `Ca ${tc.id}: tổng tiền lệch ${sign} đồng (mong đợi ${tc.expected.totalDong}, nhận ${result.totalDong})`
        );
      }

      assert.equal(result.roundingRule, tc.expected.roundingRule);
    });
  }
});
