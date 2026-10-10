const { calculateEnergyKwh } = require('./energy');
const { liveEnergyKwh, powerToWatts, toNumberOrNull } = require('./readings');
const {
  findActiveSessionByDriverId,
  findSessionById,
  existsSessionById,
  findSessionControlById,
  listActiveSessions,
} = require('./sessions.repository');
const { withTransaction } = require('../../db/tx');
const connections = require('../charge-points/connection-registry');
const { sendRemoteCommand } = require('../ocpp/commands');
const {
  AppError,
  ConflictError,
  GatewayTimeoutError,
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} = require('../../lib/errors');


function getDefaultDenyOrNotFound() {
  return require('../../lib/ownership').denyOrNotFound;
}

function formatSession(row) {
  if (!row) return null;

  const meterStart = row.meter_start !== null && row.meter_start !== undefined
    ? Number(row.meter_start)
    : null;
  const meterStop = row.meter_stop !== null && row.meter_stop !== undefined
    ? Number(row.meter_stop)
    : null;

  let currentKwh = null;
  if (row.status === 'COMPLETED' && meterStop !== null) {
    currentKwh = calculateEnergyKwh(meterStart, meterStop);
  } else if (meterStart !== null) {
    const hasLatestEnergy = row.latest_energy_value !== null && row.latest_energy_value !== undefined;
    currentKwh = hasLatestEnergy
      ? liveEnergyKwh(meterStart, row.latest_energy_value, row.latest_energy_unit)
      : null;
  }

  return {
    id: row.id,
    transaction_id: row.id,
    charge_point_id: Number(row.charge_point_id),
    charge_point_code: row.charge_point_code,
    station_id: Number(row.station_id),
    station_name: row.station_name,
    station_address: row.station_address,
    connector_id: Number(row.connector_id),
    connector_no: row.connector_no,
    driver_id: row.driver_id ? Number(row.driver_id) : null,
    id_tag_masked: row.id_tag_masked,
    meter_start: meterStart,
    meter_stop: meterStop,
    current_kwh: currentKwh,
    started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
    stopped_at: row.stopped_at ? new Date(row.stopped_at).toISOString() : null,
    stop_reason: row.stop_reason || null,
    status: row.status,
    needs_review: Boolean(row.needs_review),
    review_reason: row.review_reason || null,
    remote_stop_status: row.remote_stop_status || null,
    remote_stop_requested_at: row.remote_stop_requested_at ? new Date(row.remote_stop_requested_at).toISOString() : null,
    remote_stop_deadline: row.remote_stop_deadline ? new Date(row.remote_stop_deadline).toISOString() : null,
    latest_power_w: powerToWatts(row.latest_power_value, row.latest_power_unit),
    latest_current_a: toNumberOrNull(row.latest_current_value),
    latest_soc: toNumberOrNull(row.latest_soc_value),
    latest_sampled_at: row.latest_sampled_at ? new Date(row.latest_sampled_at).toISOString() : null,
    latest_readings: Array.isArray(row.latest_readings) ? row.latest_readings : [],
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function getCurrentSessionForDriver(user, options = {}) {
  if (!user || !user.id) return null;
  const db = options?.query ? options : options?.db || null;
  const row = await findActiveSessionByDriverId(db, user.id);
  if (!row) return null;
  return formatSession(row);
}

async function getSessionById(user, sessionId, options = {}) {
  const db = options?.query ? options : options?.db || null;
  const row = await findSessionById(db, sessionId);

  if (!row) {
    const exists = await existsSessionById(db, sessionId);
    if (!exists) {
      throw new NotFoundError('Không tìm thấy phiên sạc');
    }
    const onDeny = options?.onDeny || getDefaultDenyOrNotFound();
    await onDeny(user, 'charging_sessions', sessionId, async () => true, 'Không tìm thấy phiên sạc');
    throw new NotFoundError('Không tìm thấy phiên sạc');
  }

  const roles = user.roles || [user.role];
  const hasElevatedAccess = roles.includes('ADMIN') || roles.includes('OPERATOR') || roles.includes('ACCOUNTANT');

  if (hasElevatedAccess) {
    return formatSession(row);
  }

  const getDeny = () => options?.onDeny || getDefaultDenyOrNotFound();

  if (roles.includes('STATION_OWNER')) {
    if (String(row.station_owner_id) !== String(user.id)) {
      await getDeny()(user, 'charging_sessions', sessionId, async () => true, 'Không tìm thấy phiên sạc');
    }
    return formatSession(row);
  }

  // DRIVER hoặc vai trò khác: chỉ đọc phiên của chính mình (NĐ 13 / IDOR)
  if (!row.driver_id || String(row.driver_id) !== String(user.id)) {
    await getDeny()(user, 'charging_sessions', sessionId, async () => true, 'Không tìm thấy phiên sạc');
  }

  return formatSession(row);
}

async function getActiveSessions(user, options = {}) {
  const db = options?.query ? options : options?.db || null;
  const roles = user?.roles || [user?.role];
  const stationOwnerId = roles.includes('STATION_OWNER') && !roles.includes('ADMIN')
    ? user.id
    : null;
  return (await listActiveSessions(db, { stationOwnerId })).map(formatSession);
}

async function writeRemoteStopAudit(actorId, sessionId, chargePointId, result, metadata = {}, ip = null) {
  const audit = require('../audit/audit.repository');
  await audit.record(actorId, 'REMOTE_STOP', 'charging_session', sessionId, {
    charge_point_id: Number(chargePointId),
    result,
    ...metadata,
  }, ip);
}

async function requestRemoteStop(actor, sessionId, { commandSender, ip = null, db = null } = {}) {
  const client = db || require('../../db/pool').pool;
  const initial = await findSessionControlById(client, sessionId);
  if (!initial) throw new NotFoundError('Không tìm thấy phiên sạc');
  if (initial.status !== 'CHARGING') throw new ConflictError('Phiên sạc đã kết thúc, không thể gửi lệnh dừng');
  if (['SENDING', 'ACCEPTED'].includes(initial.remote_stop_status)) {
    throw new ConflictError('Phiên sạc đang có yêu cầu dừng chưa hoàn tất');
  }

  const requestedAt = new Date().toISOString();
  if (!connections.isConnected(initial.charge_point_code)) {
    await writeRemoteStopAudit(actor.id, sessionId, initial.charge_point_id, 'OFFLINE', { requested_at: requestedAt }, ip);
    throw new AppError(409, 'CHARGE_POINT_OFFLINE', 'Không thể dừng phiên vì trụ sạc đang ngoại tuyến');
  }

  const claim = await withTransaction(async (tx) => {
    const current = await findSessionControlById(tx, sessionId, { forUpdate: true });
    if (!current) throw new NotFoundError('Không tìm thấy phiên sạc');
    if (current.status !== 'CHARGING') throw new ConflictError('Phiên sạc đã kết thúc, không thể gửi lệnh dừng');
    if (['SENDING', 'ACCEPTED'].includes(current.remote_stop_status)) {
      throw new ConflictError('Phiên sạc đang có yêu cầu dừng chưa hoàn tất');
    }
    const updated = await tx.query(
      `UPDATE charging_sessions
       SET remote_stop_status = 'SENDING',
           remote_stop_requested_at = CURRENT_TIMESTAMP,
           remote_stop_requested_by = $2,
           remote_stop_deadline = CURRENT_TIMESTAMP + make_interval(secs => $3::int),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING remote_stop_requested_at`,
      [sessionId, actor.id, require('../../config/env').OCPP_COMMAND_TIMEOUT_SECONDS + 5]
    );
    return { session: current, requestedAt: updated.rows[0].remote_stop_requested_at };
  }, client);

  try {
    const response = await sendRemoteCommand({
      commandSender,
      chargePointCode: claim.session.charge_point_code,
      action: 'RemoteStopTransaction',
      payload: { transactionId: Number(claim.session.id) },
      rejectedMessage: 'Trụ sạc từ chối yêu cầu dừng phiên. Phiên vẫn đang hoạt động.',
      offlineCode: 'CHARGE_POINT_OFFLINE',
      offlineMessage: 'Không thể dừng phiên vì trụ sạc đang ngoại tuyến',
    });

    const accepted = await client.query(
      `UPDATE charging_sessions
       SET remote_stop_status = 'ACCEPTED',
           remote_stop_deadline = CURRENT_TIMESTAMP + make_interval(secs => $2::int),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'CHARGING' AND remote_stop_status = 'SENDING'
       RETURNING remote_stop_deadline`,
      [sessionId, require('../../config/env').REMOTE_STOP_WAIT_SECONDS]
    );
    const deadline = accepted.rows[0]?.remote_stop_deadline || null;
    await writeRemoteStopAudit(actor.id, sessionId, claim.session.charge_point_id, 'ACCEPTED', {
      requested_at: new Date(claim.requestedAt).toISOString(),
      deadline: deadline ? new Date(deadline).toISOString() : null,
    }, ip);
    return { ...response, deadline: deadline ? new Date(deadline).toISOString() : null };
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    if (error.code === 'CHARGE_POINT_OFFLINE') {
      await client.query(
        `UPDATE charging_sessions
         SET remote_stop_status = NULL,
             remote_stop_requested_at = NULL,
             remote_stop_requested_by = NULL,
             remote_stop_deadline = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'CHARGING' AND remote_stop_status = 'SENDING'`,
        [sessionId]
      );
      await writeRemoteStopAudit(actor.id, sessionId, claim.session.charge_point_id, 'OFFLINE', {
        requested_at: new Date(claim.requestedAt).toISOString(),
      }, ip);
      throw error;
    }
    const result = error instanceof UnprocessableEntityError ? 'REJECTED' : 'ERROR';
    const needsReview = error instanceof GatewayTimeoutError;
    await client.query(
      `UPDATE charging_sessions
       SET remote_stop_status = $2,
           needs_review = needs_review OR $3::boolean,
           review_reason = CASE WHEN $3::boolean AND position('REMOTE_STOP_RESULT_UNKNOWN' IN COALESCE(review_reason, '')) = 0
             THEN concat_ws('; ', NULLIF(review_reason, ''), 'REMOTE_STOP_RESULT_UNKNOWN') ELSE review_reason END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'CHARGING' AND remote_stop_status = 'SENDING'`,
      [sessionId, result, needsReview]
    );
    await writeRemoteStopAudit(actor.id, sessionId, claim.session.charge_point_id, result, {
      requested_at: new Date(claim.requestedAt).toISOString(),
      error_code: error.code || null,
    }, ip);
    if (error instanceof ServiceUnavailableError) throw error;
    throw error;
  }
}

module.exports = {
  getCurrentSessionForDriver,
  getSessionById,
  getActiveSessions,
  requestRemoteStop,
  formatSession,
};
