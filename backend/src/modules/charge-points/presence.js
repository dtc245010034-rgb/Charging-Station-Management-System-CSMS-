const { CHARGE_POINT_OFFLINE_STATUS } = require('../../lib/constants');

// Trụ mất kết nối thì đầu nối cũng không còn đáng tin: chuyển UNKNOWN, giữ nguyên ocpp_status để biết trạng thái cuối trụ báo.
// Một câu lệnh duy nhất nên trụ và đầu nối đổi cùng lúc.
async function markChargePointOffline(db, code) {
  const result = await db.query(
    `WITH offline AS (
       UPDATE charge_points SET status = $1 WHERE code = $2 RETURNING id
     )
     UPDATE connectors SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE charge_point_id IN (SELECT id FROM offline) AND status <> $1`,
    [CHARGE_POINT_OFFLINE_STATUS, code]
  );
  return result.rowCount;
}

// Dùng khi khởi động và khi tắt máy: lúc này không có kết nối OCPP nào, nên mọi trụ ONLINE đều là mồ côi.
// Câu thứ hai tự chữa cả đầu nối còn lệch của các trụ đã UNKNOWN từ trước.
async function markAllChargePointsOffline(db) {
  const points = await db.query('UPDATE charge_points SET status = $1 WHERE status = $2', [CHARGE_POINT_OFFLINE_STATUS, 'ONLINE']);
  const connectors = await db.query(
    `UPDATE connectors SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE status <> $1 AND charge_point_id IN (SELECT id FROM charge_points WHERE status = $1)`,
    [CHARGE_POINT_OFFLINE_STATUS]
  );
  return { chargePoints: points.rowCount, connectors: connectors.rowCount };
}

module.exports = { markChargePointOffline, markAllChargePointsOffline };
