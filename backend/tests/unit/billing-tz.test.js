const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  toLocalParts,
  fromLocalDateAndMinute,
  getMidnightsBetween,
} = require('../../src/modules/billing/tz');

describe('billing/tz [GYM-57]', () => {
  it('toLocalParts trả về ngày và phút trong ngày theo Asia/Ho_Chi_Minh', () => {
    // 2026-10-12T17:00:00Z -> 2026-10-13 00:00:00 (+7)
    const instant = '2026-10-12T17:00:00.000Z';
    const parts = toLocalParts(instant, 'Asia/Ho_Chi_Minh');
    assert.equal(parts.localDate, '2026-10-13');
    assert.equal(parts.hour, 0);
    assert.equal(parts.minute, 0);
    assert.equal(parts.minuteOfDay, 0);

    // 2026-10-12T15:30:00Z -> 2026-10-12 22:30:00 (+7) -> minute 22*60 + 30 = 1350
    const parts2 = toLocalParts('2026-10-12T15:30:00.000Z', 'Asia/Ho_Chi_Minh');
    assert.equal(parts2.localDate, '2026-10-12');
    assert.equal(parts2.hour, 22);
    assert.equal(parts2.minute, 30);
    assert.equal(parts2.minuteOfDay, 1350);
  });

  it('toLocalParts hoạt động đúng với Asia/Kolkata (UTC+05:30)', () => {
    // 2026-10-12T18:30:00Z -> 2026-10-13 00:00:00 (+5:30)
    const parts = toLocalParts('2026-10-12T18:30:00.000Z', 'Asia/Kolkata');
    assert.equal(parts.localDate, '2026-10-13');
    assert.equal(parts.hour, 0);
    assert.equal(parts.minute, 0);
    assert.equal(parts.minuteOfDay, 0);

    // 2026-10-12T12:00:00Z -> 17:30:00 -> 17*60 + 30 = 1050
    const parts2 = toLocalParts('2026-10-12T12:00:00.000Z', 'Asia/Kolkata');
    assert.equal(parts2.localDate, '2026-10-12');
    assert.equal(parts2.minuteOfDay, 1050);
  });

  it('toLocalParts hoạt động đúng với UTC', () => {
    const parts = toLocalParts('2026-10-12T00:00:00.000Z', 'UTC');
    assert.equal(parts.localDate, '2026-10-12');
    assert.equal(parts.minuteOfDay, 0);
  });

  it('fromLocalDateAndMinute đổi ngược chính xác sang instant', () => {
    // Nửa đêm ngày 2026-10-13 giờ VN -> 2026-10-12T17:00:00.000Z
    const t1 = fromLocalDateAndMinute('2026-10-13', 0, 'Asia/Ho_Chi_Minh');
    assert.equal(new Date(t1).toISOString(), '2026-10-12T17:00:00.000Z');

    // 22:00 ngày 2026-10-12 giờ VN -> minute 1320 -> 2026-10-12T15:00:00.000Z
    const t2 = fromLocalDateAndMinute('2026-10-12', 1320, 'Asia/Ho_Chi_Minh');
    assert.equal(new Date(t2).toISOString(), '2026-10-12T15:00:00.000Z');

    // Nửa đêm ngày 2026-10-13 giờ Ấn Độ (Asia/Kolkata) -> 2026-10-12T18:30:00.000Z
    const t3 = fromLocalDateAndMinute('2026-10-13', 0, 'Asia/Kolkata');
    assert.equal(new Date(t3).toISOString(), '2026-10-12T18:30:00.000Z');

    // Minute 1440 (24:00) chuyển thành 00:00 ngày hôm sau
    const t4 = fromLocalDateAndMinute('2026-10-12', 1440, 'Asia/Ho_Chi_Minh');
    assert.equal(new Date(t4).toISOString(), '2026-10-12T17:00:00.000Z');
  });

  it('getMidnightsBetween liệt kê các mốc nửa đêm địa phương nằm nghiêm ngặt trong khoảng phiên', () => {
    // Phiên từ 23:00 ngày 12/10 đến 01:00 ngày 13/10 (giờ VN)
    // 23:00 VN = 16:00Z ngày 12/10
    // 01:00 VN = 18:00Z ngày 12/10
    // Nửa đêm 00:00 VN ngày 13/10 = 17:00Z ngày 12/10
    const start = '2026-10-12T16:00:00.000Z';
    const stop = '2026-10-12T18:00:00.000Z';
    const midnights = getMidnightsBetween(start, stop, 'Asia/Ho_Chi_Minh');
    assert.equal(midnights.length, 1);
    assert.equal(new Date(midnights[0]).toISOString(), '2026-10-12T17:00:00.000Z');

    // Phiên không cắt qua nửa đêm
    const noMidnight = getMidnightsBetween('2026-10-12T01:00:00.000Z', '2026-10-12T05:00:00.000Z', 'Asia/Ho_Chi_Minh');
    assert.equal(noMidnight.length, 0);

    // Phiên dài 33 tiếng cắt qua 2 nửa đêm
    const start33h = '2026-10-12T10:00:00.000Z'; // 17:00 VN ngày 12/10
    const stop33h = '2026-10-13T19:00:00.000Z';  // 02:00 VN ngày 14/10
    const midnights33 = getMidnightsBetween(start33h, stop33h, 'Asia/Ho_Chi_Minh');
    assert.equal(midnights33.length, 2);
    assert.equal(new Date(midnights33[0]).toISOString(), '2026-10-12T17:00:00.000Z'); // 00:00 13/10 VN
    assert.equal(new Date(midnights33[1]).toISOString(), '2026-10-13T17:00:00.000Z'); // 00:00 14/10 VN
  });
});
