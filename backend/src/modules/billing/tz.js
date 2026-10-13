/**
 * Tiện ích xử lý múi giờ địa phương và cắt ranh giới cho billing.
 * Tuân thủ quy ước K2: luôn theo múi giờ của trạm (stations.timezone), không dùng UTC cứng.
 */

/**
 * Trích xuất các phần ngày/giờ địa phương theo múi giờ IANA.
 * @param {string|number|Date} instant - Thời điểm (ISO string, epoch ms, hoặc Date)
 * @param {string} timezone - Chuỗi IANA timezone, ví dụ 'Asia/Ho_Chi_Minh'
 * @returns {{year: number, month: number, day: number, hour: number, minute: number, second: number, localDate: string, minuteOfDay: number}}
 */
function toLocalParts(instant, timezone) {
  const d = new Date(instant);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(d);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
    else if (part.type === 'hour') hour = Number(part.value);
    else if (part.type === 'minute') minute = Number(part.value);
    else if (part.type === 'second') second = Number(part.value);
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const localDate = `${year}-${mm}-${dd}`;
  const minuteOfDay = hour * 60 + minute;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    localDate,
    minuteOfDay,
  };
}

/**
 * Đổi ngày địa phương (YYYY-MM-DD) và phút trong ngày (0..1440) sang epoch ms.
 * Minute 1440 (24:00) được tính là 00:00 ngày hôm sau.
 * @param {string} localDateStr - Ngày 'YYYY-MM-DD'
 * @param {number} minuteOfDay - Phút trong ngày (0..1440)
 * @param {string} timezone - Chuỗi IANA timezone
 * @returns {number} Epoch ms
 */
function fromLocalDateAndMinute(localDateStr, minuteOfDay, timezone) {
  let [y, m, d] = localDateStr.split('-').map(Number);
  let min = minuteOfDay;

  if (min === 1440) {
    const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
    y = nextDate.getUTCFullYear();
    m = nextDate.getUTCMonth() + 1;
    d = nextDate.getUTCDate();
    min = 0;
  }

  const hour = Math.floor(min / 60);
  const minute = min % 60;
  const targetUtcMs = Date.UTC(y, m - 1, d, hour, minute, 0, 0);

  let guessMs = targetUtcMs;
  for (let i = 0; i < 3; i++) {
    const parts = toLocalParts(guessMs, timezone);
    const currentLocalUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
    const diff = targetUtcMs - currentLocalUtcMs;
    if (diff === 0) break;
    guessMs += diff;
  }

  return guessMs;
}

/**
 * Liệt kê các mốc nửa đêm địa phương (00:00 giờ trạm) nằm nghiêm ngặt trong khoảng (startedAt, stoppedAt).
 * @param {string|number|Date} startedAt - Thời điểm bắt đầu
 * @param {string|number|Date} stoppedAt - Thời điểm kết thúc
 * @param {string} timezone - Múi giờ trạm
 * @returns {number[]} Danh sách timestamp (ms) của các nửa đêm nằm trong khoảng
 */
function getMidnightsBetween(startedAt, stoppedAt, timezone) {
  const startMs = typeof startedAt === 'number' ? startedAt : new Date(startedAt).getTime();
  const stopMs = typeof stoppedAt === 'number' ? stoppedAt : new Date(stoppedAt).getTime();
  if (startMs >= stopMs) return [];

  const startParts = toLocalParts(startMs, timezone);
  const [y, m, d] = startParts.localDate.split('-').map(Number);

  const midnights = [];
  let currentDate = new Date(Date.UTC(y, m - 1, d + 1));

  while (true) {
    const yStr = currentDate.getUTCFullYear();
    const mStr = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
    const dStr = String(currentDate.getUTCDate()).padStart(2, '0');
    const dateStr = `${yStr}-${mStr}-${dStr}`;

    const midnightMs = fromLocalDateAndMinute(dateStr, 0, timezone);
    if (midnightMs >= stopMs) break;
    if (midnightMs > startMs) {
      midnights.push(midnightMs);
    }
    currentDate = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate() + 1));
  }

  return midnights;
}

module.exports = {
  toLocalParts,
  fromLocalDateAndMinute,
  getMidnightsBetween,
};
