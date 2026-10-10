const { withTransaction } = require('../../db/tx');
const { pool } = require('../../db/pool');
const connections = require('../charge-points/connection-registry');
const { sendRemoteCommand } = require('../ocpp/commands');
const {
  AppError,
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} = require('../../lib/errors');

const START_TIMEOUT_SECONDS = 60;
const STARTABLE_OCPP_STATUSES = new Set(['Available', 'Preparing']);

async function listDriverChargePoints(db = pool) {
  const result = await db.query(
    `SELECT
       cp.id AS charge_point_id, cp.code AS charge_point_code,
       s.id AS station_id, s.name AS station_name, s.address AS station_address,
       s.status AS station_status, s.locked_at AS station_locked_at,
       c.id AS connector_id, c.connector_no, c.type AS connector_type,
       c.status AS connector_status, c.ocpp_status AS connector_ocpp_status,
       EXISTS (
         SELECT 1 FROM charging_sessions cs
         WHERE cs.connector_id = c.id AND cs.status = 'CHARGING'
       ) AS has_active_session,
       EXISTS (
         SELECT 1 FROM remote_start_requests rsr
         WHERE rsr.connector_id = c.id AND rsr.status = 'PENDING'
           AND rsr.deadline > CURRENT_TIMESTAMP
       ) AS has_pending_start
     FROM connectors c
     JOIN charge_points cp ON cp.id = c.charge_point_id
     JOIN stations s ON s.id = cp.station_id
     WHERE s.status = 'ACTIVE'
     ORDER BY s.name, cp.code, c.connector_no`
  );

  const chargePoints = new Map();
  for (const row of result.rows) {
    const online = connections.isConnected(row.charge_point_code);
    const available = online
      && !row.station_locked_at
      && row.connector_status === 'AVAILABLE'
      && STARTABLE_OCPP_STATUSES.has(row.connector_ocpp_status)
      && !row.has_active_session
      && !row.has_pending_start;
    if (!chargePoints.has(String(row.charge_point_id))) {
      chargePoints.set(String(row.charge_point_id), {
        charge_point_id: Number(row.charge_point_id),
        charge_point_code: row.charge_point_code,
        station_id: Number(row.station_id),
        station_name: row.station_name,
        station_address: row.station_address,
        connectors: [],
      });
    }
    chargePoints.get(String(row.charge_point_id)).connectors.push({
      connector_id: Number(row.connector_id),
      connector_no: row.connector_no,
      connector_type: row.connector_type,
      connector_status: row.connector_status,
      ocpp_status: row.connector_ocpp_status,
      charge_point_online: online,
      has_active_session: row.has_active_session,
      has_pending_start: row.has_pending_start,
      available,
    });
  }
  return [...chargePoints.values()];
}

async function claimRemoteStart(driver, connectorId, db) {
  return withTransaction(async (client) => {
    const connectorResult = await client.query(
      `SELECT
         c.id AS connector_id, c.connector_no, c.status AS connector_status, c.ocpp_status,
         cp.id AS charge_point_id, cp.code AS charge_point_code,
         s.status AS station_status, s.locked_at AS station_locked_at
       FROM connectors c
       JOIN charge_points cp ON cp.id = c.charge_point_id
       JOIN stations s ON s.id = cp.station_id
       WHERE c.id = $1
       FOR UPDATE OF c`,
      [connectorId]
    );
    const connector = connectorResult.rows[0];
    if (!connector) throw new NotFoundError('Không tìm thấy đầu nối');

    await client.query(
      `UPDATE remote_start_requests
       SET status = 'TIMED_OUT', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE connector_id = $1 AND status = 'PENDING' AND deadline <= CURRENT_TIMESTAMP`,
      [connectorId]
    );

    if (connector.station_status !== 'ACTIVE' || connector.station_locked_at) {
      throw new AppError(409, 'STATION_UNAVAILABLE', 'Trạm sạc hiện không hoạt động.');
    }

    if (connector.connector_status && connector.connector_status !== 'AVAILABLE') {
      throw new AppError(409, 'CONNECTOR_UNAVAILABLE', 'Đầu nối đang bảo trì hoặc tạm ngưng phục vụ.');
    }

    if (!STARTABLE_OCPP_STATUSES.has(connector.ocpp_status)) {
      throw new AppError(409, 'CONNECTOR_BUSY', 'Đầu nối đang bận hoặc chưa sẵn sàng.');
    }

    const activeSession = await client.query(
      "SELECT 1 FROM charging_sessions WHERE connector_id = $1 AND status = 'CHARGING' LIMIT 1",
      [connectorId]
    );
    if (activeSession.rowCount) {
      throw new AppError(409, 'CONNECTOR_BUSY', 'Đầu nối đang bận.');
    }

    const pendingRequest = await client.query(
      "SELECT 1 FROM remote_start_requests WHERE connector_id = $1 AND status = 'PENDING' LIMIT 1",
      [connectorId]
    );
    if (pendingRequest.rowCount) {
      throw new AppError(409, 'CONNECTOR_BUSY', 'Đầu nối đang có yêu cầu bắt đầu sạc.');
    }

    const driverPending = await client.query(
      "SELECT 1 FROM remote_start_requests WHERE driver_id = $1 AND status = 'PENDING' AND deadline > CURRENT_TIMESTAMP LIMIT 1",
      [driver.id]
    );
    if (driverPending.rowCount) {
      throw new AppError(409, 'DRIVER_BUSY', 'Bạn đang có một yêu cầu bắt đầu sạc chưa hoàn tất. Vui lòng chờ.');
    }

    let tagResult = await client.query(
      `SELECT id, tag FROM id_tags
       WHERE user_id = $1 AND is_virtual = TRUE AND status = 'ACTIVE'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       LIMIT 1`,
      [driver.id]
    );
    let tag = tagResult.rows[0];
    if (!tag) {
      const crypto = require('node:crypto');
      const virtualTag = `V${crypto.randomBytes(9).toString('hex').toUpperCase()}`;
      const inserted = await client.query(
        "INSERT INTO id_tags (tag, user_id, status, is_virtual) VALUES ($1, $2, 'ACTIVE', TRUE) ON CONFLICT DO NOTHING RETURNING id, tag",
        [virtualTag, driver.id]
      );
      tag = inserted.rows[0];
      if (!tag) {
        tagResult = await client.query(
          "SELECT id, tag FROM id_tags WHERE user_id = $1 AND is_virtual = TRUE AND status = 'ACTIVE' LIMIT 1",
          [driver.id]
        );
        tag = tagResult.rows[0];
      }
    }
    if (!tag) throw new ServiceUnavailableError('Không thể tạo hoặc tìm thấy thẻ sạc ảo cho tài xế.');

    const requestResult = await client.query(
      `INSERT INTO remote_start_requests
         (connector_id, charge_point_id, driver_id, id_tag_id, deadline)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + make_interval(secs => $5::int))
       RETURNING id, deadline`,
      [connectorId, connector.charge_point_id, driver.id, tag.id, START_TIMEOUT_SECONDS]
    );

    return { connector, tag, request: requestResult.rows[0] };
  }, db);
}

async function requestRemoteStart(driver, connectorId, { commandSender, db = pool, ip = null } = {}) {
  const claim = await claimRemoteStart(driver, connectorId, db);
  const audit = require('../audit/audit.repository');

  try {
    await sendRemoteCommand({
      commandSender,
      chargePointCode: claim.connector.charge_point_code,
      action: 'RemoteStartTransaction',
      payload: { connectorId: claim.connector.connector_no, idTag: claim.tag.tag },
      rejectedMessage: 'Trụ từ chối yêu cầu bắt đầu sạc. Hãy kiểm tra súng đã cắm chắc chưa.',
      offlineCode: 'CHARGE_POINT_OFFLINE',
      offlineMessage: 'Trụ sạc đang ngoại tuyến. Hãy thử lại khi trụ kết nối.',
    });
    await audit.record(driver.id, 'REMOTE_START', 'connector', connectorId, {
      request_id: Number(claim.request.id),
      charge_point_id: Number(claim.connector.charge_point_id),
      charge_point_code: claim.connector.charge_point_code,
      result: 'ACCEPTED',
    }, ip);
  } catch (error) {
    const status = error instanceof UnprocessableEntityError ? 'REJECTED' : 'ERROR';
    await db.query(
      `UPDATE remote_start_requests
       SET status = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'PENDING'`,
      [claim.request.id, status]
    );
    await audit.record(driver.id, 'REMOTE_START', 'connector', connectorId, {
      request_id: Number(claim.request.id),
      charge_point_id: Number(claim.connector.charge_point_id),
      charge_point_code: claim.connector.charge_point_code,
      result: status,
      error_code: error.code || null,
    }, ip).catch(() => {});
    throw error;
  }

  const latest = await getRemoteStartRequest(driver.id, claim.request.id, db);
  return {
    request_id: Number(claim.request.id),
    status: latest.status,
    deadline: new Date(claim.request.deadline).toISOString(),
  };
}

async function getRemoteStartRequest(driverId, requestId, db = pool) {
  await db.query(
    `UPDATE remote_start_requests
     SET status = 'TIMED_OUT', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND driver_id = $2 AND status = 'PENDING' AND deadline <= CURRENT_TIMESTAMP`,
    [requestId, driverId]
  );
  const result = await db.query(
    `SELECT id, status, deadline, session_id
     FROM remote_start_requests
     WHERE id = $1 AND driver_id = $2`,
    [requestId, driverId]
  );
  const request = result.rows[0];
  if (!request) throw new NotFoundError('Không tìm thấy yêu cầu bắt đầu sạc');
  return {
    request_id: Number(request.id),
    status: request.status,
    deadline: new Date(request.deadline).toISOString(),
    session_id: request.session_id === null ? null : Number(request.session_id),
  };
}

async function getPendingRemoteStartRequest(driverId, db = pool) {
  await db.query(
    `UPDATE remote_start_requests
     SET status = 'TIMED_OUT', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE driver_id = $1 AND status = 'PENDING' AND deadline <= CURRENT_TIMESTAMP`,
    [driverId]
  );
  const result = await db.query(
    `SELECT id, status, deadline, session_id
     FROM remote_start_requests
     WHERE driver_id = $1 AND status = 'PENDING' AND deadline > CURRENT_TIMESTAMP
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [driverId]
  );
  const request = result.rows[0];
  if (!request) return null;
  return {
    request_id: Number(request.id),
    status: request.status,
    deadline: new Date(request.deadline).toISOString(),
    session_id: request.session_id === null ? null : Number(request.session_id),
  };
}

module.exports = {
  START_TIMEOUT_SECONDS,
  listDriverChargePoints,
  requestRemoteStart,
  getRemoteStartRequest,
  getPendingRemoteStartRequest,
};
