const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePeriods,
  parseTimeToMinutes,
  minutesToTime,
} = require('../../src/modules/billing/tariff-periods');

describe('billing/tariff-periods [GYM-55]', () => {
  it('parseTimeToMinutes và minutesToTime đổi đúng các mốc thời gian và 24:00', () => {
    assert.equal(parseTimeToMinutes('00:00'), 0);
    assert.equal(parseTimeToMinutes('06:00'), 360);
    assert.equal(parseTimeToMinutes('22:00'), 1320);
    assert.equal(parseTimeToMinutes('24:00'), 1440);

    assert.equal(minutesToTime(0), '00:00');
    assert.equal(minutesToTime(360), '06:00');
    assert.equal(minutesToTime(1320), '22:00');
    assert.equal(minutesToTime(1440), '24:00');
  });

  it('chấp nhận 3 khung giờ hợp lệ phủ kín 24 giờ', () => {
    const raw = [
      { from: '00:00', to: '06:00', pricePerKwh: 2000, label: 'Thấp điểm đêm' },
      { from: '06:00', to: '22:00', pricePerKwh: 4000, label: 'Bình thường' },
      { from: '22:00', to: '24:00', pricePerKwh: 3000, label: 'Thấp điểm muộn' },
    ];
    const res = normalizePeriods(raw);
    assert.equal(res.ok, true);
    assert.equal(res.errors.length, 0);
    assert.equal(res.periods.length, 3);
    assert.deepEqual(res.periods[0], { startMin: 0, endMin: 360, pricePerKwh: 2000, label: 'Thấp điểm đêm' });
    assert.deepEqual(res.periods[1], { startMin: 360, endMin: 1320, pricePerKwh: 4000, label: 'Bình thường' });
    assert.deepEqual(res.periods[2], { startMin: 1320, endMin: 1440, pricePerKwh: 3000, label: 'Thấp điểm muộn' });
  });

  it('phát hiện khoảng chồng lấn OVERLAP (vd 05:00–07:00)', () => {
    const raw = [
      { from: '00:00', to: '06:00', pricePerKwh: 2000 },
      { from: '05:00', to: '07:00', pricePerKwh: 2500 },
      { from: '06:00', to: '22:00', pricePerKwh: 4000 },
      { from: '22:00', to: '24:00', pricePerKwh: 3000 },
    ];
    const res = normalizePeriods(raw);
    assert.equal(res.ok, false);
    const overlap = res.errors.find((e) => e.type === 'OVERLAP');
    assert.ok(overlap, 'Phải có lỗi OVERLAP');
    assert.equal(overlap.from, '05:00');
    assert.equal(overlap.to, '07:00');
  });

  it('phát hiện khoảng hở GAP (vd 21:00–22:00)', () => {
    const raw = [
      { from: '00:00', to: '06:00', pricePerKwh: 2000 },
      { from: '06:00', to: '21:00', pricePerKwh: 4000 },
      { from: '22:00', to: '24:00', pricePerKwh: 3000 },
    ];
    const res = normalizePeriods(raw);
    assert.equal(res.ok, false);
    const gap = res.errors.find((e) => e.type === 'GAP');
    assert.ok(gap, 'Phải có lỗi GAP');
    assert.equal(gap.from, '21:00');
    assert.equal(gap.to, '22:00');
  });

  it('tách khung vòng nửa đêm 22:00–02:00 thành [1320,1440) và [0,120) và giữ nguyên nhãn gốc', () => {
    const raw = [
      { from: '02:00', to: '06:00', pricePerKwh: 2000, label: 'Sáng sớm' },
      { from: '06:00', to: '22:00', pricePerKwh: 4000, label: 'Ngày' },
      { from: '22:00', to: '02:00', pricePerKwh: 2500, label: 'Đêm qua ngày' },
    ];
    const res = normalizePeriods(raw);
    assert.equal(res.ok, true);
    assert.equal(res.errors.length, 0);
    assert.equal(res.periods.length, 4);

    // Sắp xếp tăng dần theo startMin
    assert.deepEqual(res.periods[0], { startMin: 0, endMin: 120, pricePerKwh: 2500, label: 'Đêm qua ngày' });
    assert.deepEqual(res.periods[1], { startMin: 120, endMin: 360, pricePerKwh: 2000, label: 'Sáng sớm' });
    assert.deepEqual(res.periods[2], { startMin: 360, endMin: 1320, pricePerKwh: 4000, label: 'Ngày' });
    assert.deepEqual(res.periods[3], { startMin: 1320, endMin: 1440, pricePerKwh: 2500, label: 'Đêm qua ngày' });
  });

  it('từ chối khung bằng nhau (độ dài 0), khung ngoài [0, 1440] hoặc định dạng giờ sai', () => {
    // 05:00 -> 05:00
    const zeroLen = normalizePeriods([
      { from: '00:00', to: '05:00', pricePerKwh: 2000 },
      { from: '05:00', to: '05:00', pricePerKwh: 3000 },
      { from: '05:00', to: '24:00', pricePerKwh: 4000 },
    ]);
    assert.equal(zeroLen.ok, false);

    // Giờ không hợp lệ '25:00'
    const invalidTime = normalizePeriods([
      { from: '00:00', to: '25:00', pricePerKwh: 2000 },
    ]);
    assert.equal(invalidTime.ok, false);
  });
});
