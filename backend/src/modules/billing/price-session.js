/**
 * Module tính tiền phiên sạc (Price Session).
 * Hàm thuần túy (Pure function) - không gọi DB, không gọi đồng hồ hệ thống.
 * Tuân thủ quy ước K1, K2 và hợp đồng tại docs/dev/billing-contract.md.
 */

const { amountDong, roundHalfUp } = require('./money');
const { toLocalParts, fromLocalDateAndMinute, getMidnightsBetween } = require('./tz');

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
  return periods[0] || { pricePerKwh: 0 };
}

/**
 * Thu thập tất cả các điểm cắt thời gian:
 * Bắt đầu, kết thúc, ranh giới khung giờ và nửa đêm địa phương.
 * @param {number} startMs
 * @param {number} stopMs
 * @param {Array<Object>} periods
 * @param {string} timezone
 * @returns {number[]}
 */
function collectSplitPoints(startMs, stopMs, periods, timezone) {
  const interior = [];

  // 1. Nửa đêm địa phương nằm trong (startMs, stopMs)
  const midnights = getMidnightsBetween(startMs, stopMs, timezone);
  interior.push(...midnights);

  // 2. Ranh giới khung giờ địa phương nằm trong (startMs, stopMs)
  const startParts = toLocalParts(startMs, timezone);
  const stopParts = toLocalParts(stopMs, timezone);

  let curDate = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day));
  const endDate = new Date(Date.UTC(stopParts.year, stopParts.month - 1, stopParts.day));

  while (curDate <= endDate) {
    const yStr = curDate.getUTCFullYear();
    const mStr = String(curDate.getUTCMonth() + 1).padStart(2, '0');
    const dStr = String(curDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;

    for (const p of periods) {
      if (p.startMin > 0 && p.startMin < 1440) {
        const inst = fromLocalDateAndMinute(dateStr, p.startMin, timezone);
        if (inst > startMs && inst < stopMs) {
          interior.push(inst);
        }
      }
    }

    curDate = new Date(Date.UTC(curDate.getUTCFullYear(), curDate.getUTCMonth(), curDate.getUTCDate() + 1));
  }

  const all = [startMs, ...interior, stopMs];
  return Array.from(new Set(all)).sort((a, b) => a - b);
}

/**
 * Tính số Wh tích luỹ tại một mốc thời gian T bằng nội suy tuyến tính.
 * @param {number} targetTime
 * @param {Array<Object>} anchors - Mảng [{at, wh}] đã sắp xếp
 * @returns {number}
 */
function interpolateWhAt(targetTime, anchors) {
  const exact = anchors.find((a) => a.at === targetTime);
  if (exact) return exact.wh;

  let left = null;
  let right = null;

  for (const a of anchors) {
    if (a.at <= targetTime) {
      if (!left || a.at > left.at) left = a;
    }
    if (a.at >= targetTime) {
      if (!right || a.at < right.at) right = a;
    }
  }

  if (!left) return right ? right.wh : 0;
  if (!right) return left.wh;

  const dt = BigInt(right.at - left.at);
  const dwh = BigInt(right.wh - left.wh);
  if (dt === 0n) return left.wh;

  const progress = BigInt(targetTime - left.at);
  const interpolatedDelta = roundHalfUp(progress * dwh, dt);
  return left.wh + interpolatedDelta;
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
    samples = [],
    timezone = 'Asia/Ho_Chi_Minh',
    tariff,
  } = params;

  const startMs = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime();
  const stopMs = typeof stoppedAt === 'number' ? stoppedAt : new Date(stoppedAt).getTime();

  const startWh = Number(meterStartWh);
  const stopWh = Number(meterStopWh);

  const periods = tariff?.periods || [];
  const lines = [];

  // Mốc neo số đo
  const parsedSamples = samples.map((s) => ({
    at: typeof s.at === 'number' ? s.at : new Date(s.at).getTime(),
    wh: Number(s.wh),
  }));

  const anchors = [
    { at: startMs, wh: startWh },
    ...parsedSamples,
    { at: stopMs, wh: stopWh },
  ].sort((a, b) => a.at - b.at);

  // Điểm cắt
  const splitPoints = collectSplitPoints(startMs, stopMs, periods, timezone);

  // Tạo các đoạn năng lượng
  for (let i = 0; i < splitPoints.length - 1; i++) {
    const fromMs = splitPoints[i];
    const toMs = splitPoints[i + 1];
    if (toMs <= fromMs) continue;

    const fromWh = interpolateWhAt(fromMs, anchors);
    const toWh = interpolateWhAt(toMs, anchors);
    const deltaWh = toWh - fromWh;

    const midMs = fromMs + Math.floor((toMs - fromMs) / 2);
    const midParts = toLocalParts(midMs, timezone);
    const period = findPeriodForMinute(periods, midParts.minuteOfDay);

    const amount = amountDong(deltaWh, period.pricePerKwh);
    const startParts = toLocalParts(fromMs, timezone);

    lines.push({
      kind: 'ENERGY',
      localDate: startParts.localDate,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      wh: deltaWh,
      pricePerKwh: period.pricePerKwh,
      amountDong: amount,
    });
  }

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
