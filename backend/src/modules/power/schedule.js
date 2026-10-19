'use strict';

const { toLocalParts } = require('../billing/tz');

/**
 * Tính hạn mức công suất hiệu lực theo khung giờ và múi giờ trạm.
 * Tuân thủ K1 (W nguyên) và K2 (theo múi giờ trạm).
 *
 * @param {Object} params
 * @param {number|null} params.baseLimitW - Hạn mức nền (W)
 * @param {Array<Object>} [params.windows=[]] - Danh sách khung giờ [{ id, start_minute, end_minute, limit_w, ... }]
 * @param {string} [params.timezone='Asia/Ho_Chi_Minh'] - Múi giờ IANA của trạm
 * @param {string|number|Date} [params.at] - Thời điểm cần tính (mặc định là Date.now())
 * @returns {{ limitW: number|null, source: 'WINDOW'|'BASE', windowId?: number|string }}
 */
function effectiveLimitW({ baseLimitW, windows = [], timezone = 'Asia/Ho_Chi_Minh', at = Date.now() }) {
  if (Array.isArray(windows) && windows.length > 0) {
    const { minuteOfDay } = toLocalParts(at, timezone);
    // Khung là nửa mở [start, end)
    const matched = windows.find((w) => {
      const start = Number(w.start_minute);
      const end = Number(w.end_minute);
      return minuteOfDay >= start && minuteOfDay < end;
    });

    if (matched) {
      return {
        limitW: Number(matched.limit_w),
        source: 'WINDOW',
        windowId: matched.id,
      };
    }
  }

  return {
    limitW: baseLimitW !== undefined && baseLimitW !== null ? Number(baseLimitW) : null,
    source: 'BASE',
  };
}

module.exports = { effectiveLimitW };
