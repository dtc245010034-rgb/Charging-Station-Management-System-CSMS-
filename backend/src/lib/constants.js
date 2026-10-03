const CHARGE_POINT_CODE_PATTERN = /^[A-Z0-9_-]{1,50}$/;
const CHARGE_POINT_CODE_MESSAGE = 'Mã trụ chỉ được chứa chữ cái (A-Z), chữ số (0-9), gạch dưới (_) và gạch ngang (-), độ dài 1-50 ký tự';
const MAX_WS_PAYLOAD = 64 * 1024; // 64 KB

const BOOT_NOTIFICATION_FIELD_LIMITS = {
  chargePointVendor: 20,
  chargePointModel: 20,
  chargePointSerialNumber: 25,
  chargeBoxSerialNumber: 25,
  firmwareVersion: 50,
  iccid: 20,
  imsi: 20,
  meterType: 25,
  meterSerialNumber: 25,
};

function safeLog(value) {
  return JSON.stringify(value ?? '');
}

function sanitizeErrorMessage(message) {
  if (typeof message !== 'string') return String(message ?? '');
  return message
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, '$1***$2')
    .replace(/(password\s*=\s*)[^\s;&]+/gi, '$1***')
    .replace(/(password["']?\s*[:=]\s*["'])(?:[^"'\\]|\\.)*(["'])/gi, '$1***$2')
    .replace(/[\r\n]+/g, ' ');
}

const DEFAULT_PING_INTERVAL_SECONDS = 30;
const DEFAULT_RATE_LIMIT_MAX = 50;
const CHARGE_POINT_OFFLINE_STATUS = 'UNKNOWN';
const STATION_LOCKED_CLOSE_CODE = 1008;
const STATION_LOCKED_CLOSE_REASON = 'Station locked';

module.exports = {
  CHARGE_POINT_CODE_PATTERN,
  CHARGE_POINT_CODE_MESSAGE,
  MAX_WS_PAYLOAD,
  BOOT_NOTIFICATION_FIELD_LIMITS,
  DEFAULT_PING_INTERVAL_SECONDS,
  DEFAULT_RATE_LIMIT_MAX,
  CHARGE_POINT_OFFLINE_STATUS,
  STATION_LOCKED_CLOSE_CODE,
  STATION_LOCKED_CLOSE_REASON,
  safeLog,
  sanitizeErrorMessage,
};
