/**
 * Handler xử lý action BootNotification theo chuẩn OCPP 1.6-J
 * Story: S-08 (T-16, T-17)
 *
 * Nhiệm vụ:
 * - Lưu thông tin thiết bị: chargePointVendor, chargePointModel, firmwareVersion vào bảng charge_points.
 * - Trường thiếu thì lưu rỗng '', không từ chối tin nhắn.
 * - Cập nhật bản ghi hiện có khi gửi BootNotification nhiều lần trong cùng kết nối (không tạo bản ghi mới).
 * - Quyết định Accepted / Rejected theo trạng thái trụ và trạm (trạm bị khoá -> Rejected).
 * - Khi được chấp nhận: đặt trạng thái trụ thành 'ONLINE', gắn isBootAccepted = true cho kết nối.
 * - Khi bị từ chối: không đánh dấu trực tuyến, isBootAccepted = false.
 * - Trả về { status, currentTime (UTC ISO 8601), interval (cấu hình) }.
 */

function getDefaultPool() {
  return require('../../../db/pool').pool;
}

function getDefaultHeartbeatInterval() {
  const env = require('../../../config/env');
  return env.OCPP_HEARTBEAT_INTERVAL || 60;
}

function createBootNotificationHandler({
  pool = null,
  getHeartbeatInterval = () => 60,
  getCurrentTime = () => new Date().toISOString(),
  logInfo = console.info,
  logError = console.error,
} = {}) {
  return async function handleBootNotification(payload, { connection } = {}) {
    // 1. Đọc và chuẩn hoá các trường thiết bị từ payload (trường thiếu -> lưu chuỗi rỗng, không từ chối)
    const vendor = typeof payload?.chargePointVendor === 'string' ? payload.chargePointVendor.trim() : '';
    const model = typeof payload?.chargePointModel === 'string' ? payload.chargePointModel.trim() : '';
    const firmwareVersion = typeof payload?.firmwareVersion === 'string' ? payload.firmwareVersion.trim() : '';

    // 2. Xác định mã trụ từ kết nối đã bắt tay thành công
    const code = connection?.chargePointCode || connection?.chargePoint?.code;

    // 3. Tra cứu thông tin trụ và trạm từ DB (nếu có pool)
    let chargePointRecord = null;
    let stationLocked = false;

    if (code && pool) {
      try {
        const query = `
          SELECT cp.id, cp.code, cp.status, s.id AS station_id, s.status AS station_status, s.locked_at
          FROM charge_points cp
          JOIN stations s ON s.id = cp.station_id
          WHERE cp.code = $1
          LIMIT 1
        `;
        const res = await pool.query(query, [code]);
        if (res.rows && res.rows.length > 0) {
          chargePointRecord = res.rows[0];
          stationLocked = Boolean(chargePointRecord.locked_at);
        }
      } catch (error) {
        logError(`[OCPP] BootNotification: Lỗi tra cứu CSDL cho trụ ${code}:`, error.message);
      }
    }

    if (connection?.isStationLocked || connection?.stationStatus === 'LOCKED') {
      stationLocked = true;
    }

    const interval = Number(getHeartbeatInterval()) || 60;
    const currentTime = getCurrentTime();

    // 4. Quyết định Accepted hoặc Rejected theo trạng thái trạm
    if (stationLocked) {
      if (connection) {
        connection.isBootAccepted = false;
      }
      logInfo(`[OCPP] BootNotification Rejected | chargePoint: ${code || 'unknown'} | trạm bị khoá`);
      return {
        status: 'Rejected',
        currentTime,
        interval,
      };
    }

    // 5. Cập nhật thông tin vào charge_points và chuyển trạng thái sang ONLINE
    if (chargePointRecord && pool) {
      try {
        await pool.query(
          `UPDATE charge_points
           SET vendor = $1,
               model = $2,
               firmware_version = $3,
               status = 'ONLINE',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [vendor, model, firmwareVersion, chargePointRecord.id]
        );
        logInfo(`[OCPP] BootNotification: Cập nhật trụ ${code} thành công (status=ONLINE)`);
      } catch (error) {
        logError(`[OCPP] BootNotification: Lỗi cập nhật CSDL cho trụ ${code}:`, error.message);
      }
    }

    // Đánh dấu kết nối đã được chấp nhận BootNotification
    if (connection) {
      connection.isBootAccepted = true;
      if (connection.chargePoint) {
        connection.chargePoint.vendor = vendor;
        connection.chargePoint.model = model;
        connection.chargePoint.firmware_version = firmwareVersion;
        connection.chargePoint.status = 'ONLINE';
      }
    }

    return {
      status: 'Accepted',
      currentTime,
      interval,
    };
  };
}

let defaultHandler = null;

function getDefaultHandler() {
  if (!defaultHandler) {
    defaultHandler = createBootNotificationHandler({
      pool: getDefaultPool(),
      getHeartbeatInterval: () => getDefaultHeartbeatInterval(),
    });
  }
  return defaultHandler;
}

module.exports = {
  createBootNotificationHandler,
  get bootNotificationHandler() {
    return getDefaultHandler();
  },
};
