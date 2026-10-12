import { formatNumber } from '../../app/format.js';

const ENERGY_MEASURAND = 'Energy.Active.Import.Register';

// Máy chủ ghi lý do xem xét bằng mã hoặc câu tiếng Anh; giao diện chỉ dịch khi hiển thị.
const REASON_LABELS = {
  'Replaced by new transaction': 'Bị thay bằng phiên mới trên cùng đầu nối',
  'Timestamp skewed by more than 24 hours': 'Đồng hồ trụ lệch quá 24 giờ',
  REMOTE_STOP_TIMEOUT: 'Trụ nhận lệnh dừng nhưng không gửi xác nhận kết thúc',
  REMOTE_STOP_RESULT_UNKNOWN: 'Chưa rõ trụ đã nhận lệnh dừng hay chưa',
  STOP_TRANSACTION_TIMEOUT: 'Quá hạn chờ tin kết thúc phiên sau lệnh dừng',
  CHARGE_POINT_OFFLINE_TIMEOUT: 'Trụ mất liên lạc quá lâu',
  METER_VALUE_DECREASE: 'Số đo năng lượng giảm',
  METER_STOP_BELOW_START: 'Số đo cuối nhỏ hơn số đo đầu',
  CONNECTOR_AVAILABLE_WITH_OPEN_SESSION: 'Trụ báo đầu nối rảnh nhưng phiên vẫn đang mở',
  CLOCK_SKEW: 'Đồng hồ trụ lệch quá 24 giờ',
  INVALID_TRANSACTION_DATA: 'Dữ liệu số đo kèm tin kết thúc không hợp lệ',
};

function labelOne(reason) {
  const tag = /^Tag status: (.+)$/.exec(reason);
  if (tag) return `Thẻ sạc không hợp lệ (trạng thái: ${tag[1]})`;
  return REASON_LABELS[reason] ?? reason;
}

export function reviewReasonLabel(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.split('; ').map(labelOne).join('; ');
}

export const kwhLabel = (value) => (value === null || value === undefined ? '— kWh' : `${formatNumber(value)} kWh`);

export function lacksEnergyReading(session) {
  const readings = Array.isArray(session?.latest_readings) ? session.latest_readings : [];
  return !readings.some((reading) => reading.measurand === ENERGY_MEASURAND);
}
