const { CHARGE_POINT_OFFLINE_STATUS, CHARGE_POINT_ONLINE_STATUS, CHARGE_POINT_STALE_STATUS } = require('../../lib/constants');
const { OCPP_CONNECTOR_STATUS_MAP } = require('../connectors/status-mapping');
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
    [CHARGE_POINT_OFFLINE_STATUS, CHARGE_POINT_ONLINE_STATUS]
  );
  const connectors = await db.query(
    `UPDATE connectors SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE status <> $1 AND charge_point_id IN (SELECT id FROM charge_points WHERE status = $1)`,
    [CHARGE_POINT_OFFLINE_STATUS]
  );
  points.rows.forEach(publishChargePoint);
  return { chargePoints: points.rowCount, connectors: connectors.rowCount };
}

// Bảng ánh xạ ocpp_status -> connectors.status lấy từ status-mapping.js, truyền vào SQL dạng mảng để không có bản sao thứ hai.
const MAPPING_OCPP = Object.keys(OCPP_CONNECTOR_STATUS_MAP);
const MAPPING_STATUS = MAPPING_OCPP.map((ocpp) => OCPP_CONNECTOR_STATUS_MAP[ocpp]);

// Mỗi tin từ trụ cập nhật last_seen_at. Trụ đang OFFLINE/UNKNOWN thì về ONLINE và đầu nối lấy lại trạng thái từ ocpp_status đã lưu.
// SKIP LOCKED: hàng đang bị giao dịch khác giữ thì bỏ qua lần này, không để Heartbeat chờ khoá và giữ kết nối pool.
// recover=false cho tin trước khi Boot được chấp nhận: BootNotification tự ghi ONLINE và phát sự kiện, không phát trùng.
async function markChargePointSeen(db, code, { recover = true } = {}) {
  const result = await db.query(
    `WITH target AS (
       SELECT cp.id, cp.station_id, s.owner_id, ($7::boolean AND cp.status IN ($2, $3)) AS recovering
       FROM charge_points cp JOIN stations s ON s.id = cp.station_id
       WHERE cp.code = $1 AND s.locked_at IS NULL
       FOR UPDATE OF cp SKIP LOCKED
     ), seen AS (
       UPDATE charge_points cp
       SET last_seen_at = CURRENT_TIMESTAMP,
           status = CASE WHEN target.recovering THEN $4 ELSE cp.status END
       FROM target WHERE cp.id = target.id
       RETURNING cp.id, target.station_id, target.owner_id, target.recovering
     ), restored AS (
       UPDATE connectors c SET status = m.status, updated_at = CURRENT_TIMESTAMP
       FROM seen, unnest($5::text[], $6::text[]) AS m(ocpp_status, status)
       WHERE seen.recovering AND c.charge_point_id = seen.id AND c.ocpp_status = m.ocpp_status AND c.status <> m.status
       RETURNING c.id
     )
     SELECT id, station_id, owner_id FROM seen WHERE recovering`,
    [code, CHARGE_POINT_STALE_STATUS, CHARGE_POINT_OFFLINE_STATUS, CHARGE_POINT_ONLINE_STATUS, MAPPING_OCPP, MAPPING_STATUS, recover]
  );
  result.rows.forEach(publishChargePoint);
}

module.exports = { markChargePointOffline, markAllChargePointsOffline, markChargePointSeen };
