/**
 * Module xử lý chuẩn hoá và kiểm tra các khung giờ trong ngày (Tariff Periods).
 * Phục vụ S-29 (GYM-55).
 * Kiểm tra phủ kín 24 giờ ở máy chủ, không tin tưởng giao diện.
 */

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Chuyển chuỗi HH:MM hoặc 24:00 thành số phút trong ngày (0..1440).
 * @param {string|number} timeStr - 'HH:MM' hoặc '24:00' hoặc số phút
 * @returns {number} Số phút từ 0 đến 1440, hoặc -1 nếu không hợp lệ
 */
function parseTimeToMinutes(timeStr) {
  if (typeof timeStr === 'number') {
    return Number.isInteger(timeStr) && timeStr >= 0 && timeStr <= 1440 ? timeStr : -1;
  }
  if (typeof timeStr !== 'string') return -1;
  const trimmed = timeStr.trim();
  if (trimmed === '24:00') return 1440;
  const match = trimmed.match(TIME_REGEX);
  if (!match) return -1;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour * 60 + minute;
}

/**
 * Chuyển số phút trong ngày (0..1440) thành chuỗi HH:MM hoặc 24:00.
 * @param {number} minutes - Phút (0..1440)
 * @returns {string} 'HH:MM' hoặc '24:00'
 */
function minutesToTime(minutes) {
  if (minutes === 1440) return '24:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Chuẩn hoá danh sách khung giờ:
 * - Tách các khung vòng qua nửa đêm (vd 22:00–02:00 thành [1320, 1440) và [0, 120))
 * - Phát hiện chồng lấn (OVERLAP) và khoảng trống (GAP)
 * @param {Array<Object>} rawPeriods - Danh sách khung giờ [{from, to, pricePerKwh, label}]
 * @returns {{ok: boolean, errors: Array<{type: string, from?: string, to?: string, message?: string}>, periods: Array<Object>}}
 */
function normalizePeriods(rawPeriods) {
  if (!Array.isArray(rawPeriods) || rawPeriods.length === 0) {
    return {
      ok: false,
      errors: [{ type: 'GAP', from: '00:00', to: '24:00', message: 'Biểu giá chưa có khung giờ nào' }],
      periods: [],
    };
  }

  const errors = [];
  const expanded = [];

  for (const item of rawPeriods) {
    const rawFrom = item.from ?? item.startMinute ?? item.startMin;
    const rawTo = item.to ?? item.endMinute ?? item.endMin;

    const startMin = parseTimeToMinutes(rawFrom);
    const endMin = parseTimeToMinutes(rawTo);

    if (startMin === -1 || endMin === -1) {
      errors.push({
        type: 'INVALID_FORMAT',
        from: String(rawFrom),
        to: String(rawTo),
        message: 'Định dạng giờ không hợp lệ (phải là HH:MM hoặc 24:00)',
      });
      continue;
    }

    if (startMin === endMin) {
      errors.push({
        type: 'ZERO_DURATION',
        from: minutesToTime(startMin),
        to: minutesToTime(endMin),
        message: 'Khung giờ có thời lượng bằng 0',
      });
      continue;
    }

    const defaultLabel = `${minutesToTime(startMin)}–${minutesToTime(endMin)}`;
    const label = item.label || defaultLabel;
    const pricePerKwh = Number(item.pricePerKwh ?? item.price_per_kwh_dong);

    if (startMin > endMin) {
      // Khung vòng qua nửa đêm, ví dụ 22:00 -> 02:00
      // Đoạn 1: startMin -> 1440 (24:00)
      expanded.push({
        startMin,
        endMin: 1440,
        pricePerKwh,
        label,
      });
      // Đoạn 2: 0 -> endMin
      expanded.push({
        startMin: 0,
        endMin,
        pricePerKwh,
        label,
      });
    } else {
      expanded.push({
        startMin,
        endMin,
        pricePerKwh,
        label,
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, periods: [] };
  }

  // Quét kiểm tra độ phủ trên [0, 1440) phút
  const coverage = new Uint16Array(1440);
  for (const seg of expanded) {
    for (let m = seg.startMin; m < seg.endMin; m++) {
      coverage[m]++;
    }
  }

  // Gom các đoạn liên tục của GAP (coverage === 0) và OVERLAP (coverage > 1)
  let currentRange = null;

  for (let m = 0; m <= 1440; m++) {
    const status = m === 1440 ? 'END' : (coverage[m] === 0 ? 'GAP' : (coverage[m] > 1 ? 'OVERLAP' : 'OK'));

    if (currentRange) {
      if (status !== currentRange.type) {
        errors.push({
          type: currentRange.type,
          from: minutesToTime(currentRange.start),
          to: minutesToTime(m),
        });
        currentRange = null;
      }
    }

    if (!currentRange && (status === 'GAP' || status === 'OVERLAP')) {
      currentRange = { type: status, start: m };
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, periods: [] };
  }

  // Sắp xếp tăng dần theo startMin
  expanded.sort((a, b) => a.startMin - b.startMin);

  return {
    ok: true,
    errors: [],
    periods: expanded,
  };
}

module.exports = {
  parseTimeToMinutes,
  minutesToTime,
  normalizePeriods,
};
