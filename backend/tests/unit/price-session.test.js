const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { priceSession } = require('../../src/modules/billing/price-session');

const handCases = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/billing/hand-cases.json'), 'utf8')
);

describe('billing/price-session: một khung [GYM-56]', () => {
  it('tính đúng ca C01 (Một khung, kWh tròn)', () => {
    const c01 = handCases.find((c) => c.id === 'C01');
    assert.ok(c01);
    const result = priceSession(c01.input);

    assert.equal(result.totalDong, c01.expected.totalDong);
    assert.equal(result.roundingRule, c01.expected.roundingRule);
    assert.equal(result.lines.length, c01.expected.lines.length);
    assert.equal(result.lines[0].wh, c01.expected.lines[0].wh);
    assert.equal(result.lines[0].amountDong, c01.expected.lines[0].amountDong);
    assert.equal(result.lines[0].localDate, c01.expected.lines[0].localDate);
  });

  it('tính đúng ca C02 (Một khung, kWh lẻ -> làm tròn nửa lên)', () => {
    const c02 = handCases.find((c) => c.id === 'C02');
    assert.ok(c02);
    const result = priceSession(c02.input);

    assert.equal(result.totalDong, c02.expected.totalDong);
    assert.equal(result.lines[0].amountDong, 7503);
  });

  it('tính đúng ca C17 (Phiên 0 kWh)', () => {
    const c17 = handCases.find((c) => c.id === 'C17');
    assert.ok(c17);
    const result = priceSession(c17.input);

    assert.equal(result.totalDong, 0);
    assert.equal(result.lines[0].wh, 0);
    assert.equal(result.lines[0].amountDong, 0);
  });

  it('bảo toàn bất biến tổng Wh các đoạn = meterStopWh - meterStartWh', () => {
    const input = {
      startedAt: '2026-10-12T01:00:00.000Z',
      stoppedAt: '2026-10-12T02:00:00.000Z',
      meterStartWh: 1234,
      meterStopWh: 5678,
      timezone: 'Asia/Ho_Chi_Minh',
      tariff: {
        periods: [{ startMin: 0, endMin: 1440, pricePerKwh: 3500 }],
      },
    };
    const result = priceSession(input);
    const totalWh = result.lines.filter((l) => l.kind === 'ENERGY').reduce((sum, l) => sum + l.wh, 0);
    assert.equal(totalWh, input.meterStopWh - input.meterStartWh);
  });
});

describe('billing/price-session: cắt nhiều khung và qua nửa đêm [GYM-56, GYM-57]', () => {
  it('chia thành 2 đoạn khi phiên cắt qua ranh giới 22:00 và áp đúng đơn giá từng khung', () => {
    // 21:30 VN = 14:30Z; 23:30 VN = 16:30Z; ranh giới 22:00 VN = 15:00Z
    // Khung 1 (06:00-22:00): 3000 đ/kWh
    // Khung 2 (22:00-06:00): 4000 đ/kWh
    // Tổng 10 000 Wh, nội suy tuyến tính: 30 phút đầu = 2 500 Wh, 90 phút sau = 7 500 Wh
    // Tiền đoạn 1: 2500 x 3000 / 1000 = 7 500 đ
    // Tiền đoạn 2: 7500 x 4000 / 1000 = 30 000 đ
    // Tổng: 37 500 đ
    const input = {
      startedAt: '2026-10-12T14:30:00.000Z',
      stoppedAt: '2026-10-12T16:30:00.000Z',
      meterStartWh: 0,
      meterStopWh: 10000,
      timezone: 'Asia/Ho_Chi_Minh',
      tariff: {
        periods: [
          { startMin: 360, endMin: 1320, pricePerKwh: 3000, label: 'Ngày' },
          { startMin: 1320, endMin: 1440, pricePerKwh: 4000, label: 'Đêm' },
          { startMin: 0, endMin: 360, pricePerKwh: 4000, label: 'Đêm' },
        ],
      },
    };
    const result = priceSession(input);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].wh, 2500);
    assert.equal(result.lines[0].pricePerKwh, 3000);
    assert.equal(result.lines[0].amountDong, 7500);
    assert.equal(result.lines[1].wh, 7500);
    assert.equal(result.lines[1].pricePerKwh, 4000);
    assert.equal(result.lines[1].amountDong, 30000);
    assert.equal(result.totalDong, 37500);
  });

  it('chia đoạn khi phiên cắt qua nửa đêm 00:00 giờ trạm và gắn đúng localDate', () => {
    // 23:00 VN ngày 12/10 = 16:00Z; 01:00 VN ngày 13/10 = 18:00Z
    // Nửa đêm 00:00 VN = 17:00Z ngày 12/10
    // Khung 1 (22:00-24:00): 3000 đ/kWh
    // Khung 2 (00:00-06:00): 2000 đ/kWh
    // 8 000 Wh: 1h trước 0h = 4 000 Wh, 1h sau 0h = 4 000 Wh
    // Đoạn 1: 4000 x 3000 / 1000 = 12 000 đ, localDate: 2026-10-12
    // Đoạn 2: 4000 x 2000 / 1000 = 8 000 đ, localDate: 2026-10-13
    const input = {
      startedAt: '2026-10-12T16:00:00.000Z',
      stoppedAt: '2026-10-12T18:00:00.000Z',
      meterStartWh: 0,
      meterStopWh: 8000,
      timezone: 'Asia/Ho_Chi_Minh',
      tariff: {
        periods: [
          { startMin: 0, endMin: 360, pricePerKwh: 2000, label: 'Sáng sớm' },
          { startMin: 360, endMin: 1320, pricePerKwh: 4000, label: 'Ngày' },
          { startMin: 1320, endMin: 1440, pricePerKwh: 3000, label: 'Đêm' },
        ],
      },
    };
    const result = priceSession(input);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].localDate, '2026-10-12');
    assert.equal(result.lines[0].amountDong, 12000);
    assert.equal(result.lines[1].localDate, '2026-10-13');
    assert.equal(result.lines[1].amountDong, 8000);
    assert.equal(result.totalDong, 20000);
  });

  it('sử dụng số đo thực tế khi mẫu nằm đúng mốc biên hoặc nội suy khi mẫu thưa', () => {
    // Phiên 21:00 đến 23:00 (ranh giới 22:00)
    // 21:00 = 14:00Z, 22:00 = 15:00Z, 23:00 = 16:00Z
    // Có mẫu đúng lúc 22:00 (15:00Z) với Wh = 3000
    const input = {
      startedAt: '2026-10-12T14:00:00.000Z',
      stoppedAt: '2026-10-12T16:00:00.000Z',
      meterStartWh: 0,
      meterStopWh: 10000,
      samples: [
        { at: '2026-10-12T15:00:00.000Z', wh: 3000 },
      ],
      timezone: 'Asia/Ho_Chi_Minh',
      tariff: {
        periods: [
          { startMin: 360, endMin: 1320, pricePerKwh: 3000 },
          { startMin: 1320, endMin: 1440, pricePerKwh: 4000 },
          { startMin: 0, endMin: 360, pricePerKwh: 4000 },
        ],
      },
    };
    const result = priceSession(input);
    assert.equal(result.lines.length, 2);
    assert.equal(result.lines[0].wh, 3000); // Lấy đúng mẫu tại mốc biên
    assert.equal(result.lines[1].wh, 7000);
    assert.equal(result.totalDong, 3000 * 3 + 7000 * 4);
  });
});

describe('billing/price-session: phí chiếm trụ IDLE [GYM-54]', () => {
  it('không phát sinh phí IDLE khi xe rời trụ trong thời gian ân hạn (C13)', () => {
    // Phiên sạc 10 000 Wh (40 000 đ), kết thúc lúc 09:00 (02:00Z)
    // Rời trụ lúc 09:10 (ân hạn 15 phút, từ 09:00 đến 09:15)
    // 09:10 <= 09:15 -> 0 đ phí IDLE
    const input = {
      startedAt: '2026-10-12T01:00:00.000Z',
      stoppedAt: '2026-10-12T02:00:00.000Z',
      meterStartWh: 0,
      meterStopWh: 10000,
      timezone: 'Asia/Ho_Chi_Minh',
      tariff: {
        periods: [{ startMin: 0, endMin: 1440, pricePerKwh: 4000 }],
        idle: { graceMin: 15, perMinDong: 1000 },
      },
      idleInterval: {
        from: '2026-10-12T02:00:00.000Z',
        to: '2026-10-12T02:10:00.000Z', // 10 phút sau sạc xong
      },
    };
    const result = priceSession(input);
    assert.equal(result.lines.length, 1);
    assert.equal(result.lines.some((l) => l.kind === 'IDLE'), false);
    assert.equal(result.totalDong, 40000);
  });

  it('tính phí IDLE khi quá ân hạn, mỗi phút dở dang tính trọn 1 phút (C14)', () => {
    // Sạc xong lúc 02:00Z (40 000 đ)
    // Ân hạn 15 phút (đến 02:15Z)
    // Rời trụ lúc 02:52:10Z (quá hạn 37 phút 10 giây -> làm tròn trần thành 38 phút)
    // 38 phút x 1000 đ = 38 000 đ
    // Tổng = 40 000 + 38 000 = 78 000 đ
    const input = {
      startedAt: '2026-10-12T01:00:00.000Z',
      stoppedAt: '2026-10-12T02:00:00.000Z',
      meterStartWh: 0,
      meterStopWh: 10000,
      timezone: 'Asia/Ho_Chi_Minh',
      tariff: {
        periods: [{ startMin: 0, endMin: 1440, pricePerKwh: 4000 }],
        idle: { graceMin: 15, perMinDong: 1000 },
      },
      idleInterval: {
        from: '2026-10-12T02:00:00.000Z',
        to: '2026-10-12T02:52:10.000Z',
      },
    };
    const result = priceSession(input);
    const idleLine = result.lines.find((l) => l.kind === 'IDLE');
    assert.ok(idleLine);
    assert.equal(idleLine.minutes, 38);
    assert.equal(idleLine.perMinDong, 1000);
    assert.equal(idleLine.amountDong, 38000);
    assert.equal(idleLine.wh, 0);
    assert.equal(idleLine.pricePerKwh, null);
    assert.equal(result.totalDong, 78000);
  });

  it('tính đúng phí IDLE khi khoảng chiếm trụ vắt qua nửa đêm (C15)', () => {
    // Sạc xong lúc 23:30 (16:30Z ngày 12/10), 40 000 đ
    // Ân hạn 15 phút -> hết ân hạn lúc 23:45 (16:45Z)
    // Rời trụ lúc 00:33 (17:33Z ngày 13/10)
    // Thời gian tính phí: 23:45 đến 00:33 = 48 phút tròn
    // 48 x 1000 = 48 000 đ
    // Tổng = 40 000 + 48 000 = 88 000 đ
    // localDate của dòng IDLE là ngày của mốc hết ân hạn (2026-10-12)
    const input = {
      startedAt: '2026-10-12T15:30:00.000Z',
      stoppedAt: '2026-10-12T16:30:00.000Z',
      meterStartWh: 0,
      meterStopWh: 10000,
      timezone: 'Asia/Ho_Chi_Minh',
      tariff: {
        periods: [{ startMin: 0, endMin: 1440, pricePerKwh: 4000 }],
        idle: { graceMin: 15, perMinDong: 1000 },
      },
      idleInterval: {
        from: '2026-10-12T16:30:00.000Z',
        to: '2026-10-12T17:33:00.000Z',
      },
    };
    const result = priceSession(input);
    const idleLine = result.lines.find((l) => l.kind === 'IDLE');
    assert.ok(idleLine);
    assert.equal(idleLine.minutes, 48);
    assert.equal(idleLine.amountDong, 48000);
    assert.equal(idleLine.localDate, '2026-10-12');
    assert.equal(result.totalDong, 88000);
  });
});

