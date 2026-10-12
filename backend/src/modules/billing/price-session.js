/**
 * Module tính tiền phiên sạc (Price Session).
 * Hàm thuần túy (Pure function) - không gọi DB, không gọi đồng hồ hệ thống.
 * Tuân thủ quy ước K1, K2 và hợp đồng tại docs/dev/billing-contract.md.
 */

const { amountDong } = require('./money');
const { toLocalParts } = require('./tz');

/**
 * Tìm khung giá áp dụng cho một phút trong ngày (0..1440).
 * @param {Array<Object>} periods - Danh sách khung giờ đã chuẩn hoá
 * @param {number} minuteOfDay - Phút trong ngày (0..1440)
 * @returns {Object} Khung giá
 */
function findPeriodForMinute(periods, minuteOfDay) {
  const m = minuteOfDay === 1440 ? 0 : minuteOfDay;
  for (const p of periods) {
    if (m >= p.startMin && m < p.endMin) {
      return p;
    }
  }
  // Mặc định khung đầu tiên nếu không khớp
  return periods[0] || { pricePerKwh: 0 };
}

/**
 * Tính tiền phiên sạc theo biểu giá và số đo.
 * @param {Object} params
 * @param {string|number|Date} params.startedAt - Thời điểm bắt đầu
 * @param {string|number|Date} params.stoppedAt - Thời điểm kết thúc
 * @param {number} params.meterStartWh - Wh bắt đầu
 * @param {number} params.meterStopWh - Wh kết thúc
 * @param {Array<Object>} [params.samples] - Mẫu số đo tích luỹ [{at, wh}]
 * @param {string} [params.timezone] - Múi giờ trạm (vd: 'Asia/Ho_Chi_Minh')
 * @param {Object} params.tariff - Biểu giá {periods, idle}
 * @param {Object} [params.idleInterval] - Khoảng thời gian chiếm trụ {from, to}
 * @returns {Object} { lines, totalDong, roundingRule }
 */
function priceSession(params) {
  const {
    startedAt,
    stoppedAt,
    meterStartWh,
    meterStopWh,
    timezone = 'Asia/Ho_Chi_Minh',
    tariff,
  } = params;
  const startMs = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime();
  const stopMs = typeof stoppedAt === 'number' ? stoppedAt : new Date(stoppedAt).getTime();

  const startWh = Number(meterStartWh);
  const stopWh = Number(meterStopWh);

  const periods = tariff?.periods || [];
  const lines = [];

  // Xác định điểm giữa của phiên để lấy khung giá (cho trường hợp phiên 1 khung)
  const midMs = startMs + Math.floor((stopMs - startMs) / 2);
  const midParts = toLocalParts(midMs, timezone);
  const period = findPeriodForMinute(periods, midParts.minuteOfDay);

  const deltaWh = stopWh - startWh;
  const lineAmount = amountDong(deltaWh, period.pricePerKwh);
  const startParts = toLocalParts(startMs, timezone);

  lines.push({
    kind: 'ENERGY',
    localDate: startParts.localDate,
    from: new Date(startMs).toISOString(),
    to: new Date(stopMs).toISOString(),
    wh: deltaWh,
    pricePerKwh: period.pricePerKwh,
    amountDong: lineAmount,
  });

  const totalDong = lines.reduce((sum, l) => sum + l.amountDong, 0);

  return {
    lines,
    totalDong,
    roundingRule: 'PER_SEGMENT_HALF_UP',
  };
}

module.exports = {
  priceSession,
};
