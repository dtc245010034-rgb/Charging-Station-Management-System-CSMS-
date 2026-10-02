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

module.exports = {
  CHARGE_POINT_CODE_PATTERN,
  CHARGE_POINT_CODE_MESSAGE,
  MAX_WS_PAYLOAD,
  BOOT_NOTIFICATION_FIELD_LIMITS,
  safeLog,
};
