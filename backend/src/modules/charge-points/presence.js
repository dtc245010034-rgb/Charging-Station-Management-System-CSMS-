const { CHARGE_POINT_OFFLINE_STATUS } = require('../../lib/constants');
const { publish } = require('../fleet-status/fleet-status.events');

const publishChargePoint = (row) => publish({ ownerId: row.owner_id, stationId: row.station_id, chargePointId: row.id });

// Trụ mất kết nối thì đầu nối cũng không còn đáng tin: chuyển UNKNOWN, giữ nguyên ocpp_status để biết trạng thái cuối trụ báo.
// Một câu lệnh duy nhất nên trụ và đầu nối đổi cùng lúc.
async function markChargePointOffline(db, code) {
  const result = await db.query(
    `WITH offline AS (
       UPDATE charge_points cp SET status = $1
       FROM stations s
       WHERE cp.code = $2 AND s.id = cp.station_id
       RETURNING cp.id, cp.station_id, s.owner_id
     ), connectors_updated AS (
       UPDATE connectors SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE charge_point_id IN (SELECT id FROM offline) AND status <> $1
       RETURNING id
     )
     SELECT offline.*, (SELECT count(*) FROM connectors_updated)::int AS connectors_changed FROM offline`,
    [CHARGE_POINT_OFFLINE_STATUS, code]
  );
  result.rows.forEach(publishChargePoint);
  return result.rows[0]?.connectors_changed ?? 0;
}

// Dùng khi khởi động và khi tắt máy: lúc này không có kết nối OCPP nào, nên mọi trụ ONLINE đều là mồ côi.
// Câu thứ hai tự chữa cả đầu nối còn lệch của các trụ đã UNKNOWN từ trước.
async function markAllChargePointsOffline(db) {
  const points = await db.query(
    `UPDATE charge_points cp SET status = $1
     FROM stations s
     WHERE cp.status = $2 AND s.id = cp.station_id
     RETURNING cp.id, cp.station_id, s.owner_id`,
    [CHARGE_POINT_OFFLINE_STATUS, 'ONLINE']
  );
  const connectors = await db.query(
    `UPDATE connectors SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE status <> $1 AND charge_point_id IN (SELECT id FROM charge_points WHERE status = $1)`,
    [CHARGE_POINT_OFFLINE_STATUS]
  );
  points.rows.forEach(publishChargePoint);
  return { chargePoints: points.rowCount, connectors: connectors.rowCount };
}

module.exports = { markChargePointOffline, markAllChargePointsOffline };
