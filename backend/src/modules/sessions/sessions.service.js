const { calculateEnergyKwh } = require('./energy');
const { liveEnergyKwh, powerToWatts, toNumberOrNull } = require('./readings');
const {
  findActiveSessionByDriverId,
  findSessionById,
  existsSessionById,
  findSessionControlById,
  listActiveSessions,
  listUnexpectedSessions,
  listDriverSessionHistory,
  countDriverSessionHistory,
} = require('./sessions.repository');
const { withTransaction } = require('../../db/tx');
const { meterValueToWh } = require('./meter-values.repository');
const connections = require('../charge-points/connection-registry');
const { sendRemoteCommand } = require('../ocpp/commands');
const { sanitizeErrorMessage } = require('../../lib/constants');
const {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
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
    last_seen_at: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
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

const DRIVER_HISTORY_PAGE_SIZE = 50;
const DRIVER_HISTORY_CURSOR_PAGE_SIZE = 20;
const MAX_DATABASE_ID = 9223372036854775807n;

function formatHistoryRow(row) {
  const meterStart = row.meter_start === null ? null : Number(row.meter_start);
  const meterStop = row.meter_stop === null ? null : Number(row.meter_stop);
  const currentKwh = Number.isFinite(meterStart)
    && Number.isFinite(meterStop)
    && meterStop >= meterStart
    ? (meterStop - meterStart) / 1000
    : null;
  return {
    id: String(row.id),
    status: row.status,
    stationName: row.station_name,
    stationAddress: row.station_address,
    chargePointCode: row.charge_point_code,
    connectorNo: row.connector_no,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    stopReason: row.stop_reason,
    currentKwh,
    billingStatus: row.billing_status,
    billingReason: row.billing_reason,
    invoiceTotalDong: row.invoice_total_dong,
  };
}

function decodeHistoryCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > 300) {
    throw new BadRequestError('Con trỏ lịch sử phiên không hợp lệ');
  }

  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const stoppedAt = new Date(value.stoppedAt);
    const sessionId = BigInt(value.id);
    if (
      !Number.isFinite(stoppedAt.getTime())
      || stoppedAt.toISOString() !== value.stoppedAt
      || sessionId < 1n
      || sessionId > MAX_DATABASE_ID
    ) {
      throw new Error('Invalid cursor fields');
    }
    return { stoppedAt: stoppedAt.toISOString(), sessionId: sessionId.toString() };
  } catch {
    throw new BadRequestError('Con trỏ lịch sử phiên không hợp lệ');
  }
}

function encodeHistoryCursor(row) {
  return Buffer.from(JSON.stringify({
    stoppedAt: new Date(row.stopped_at).toISOString(),
    id: String(row.id),
  })).toString('base64url');
}

async function getDriverSessionHistory(user, {
  cursor,
  month = null,
  page = null,
  limit = null,
  db = null,
} = {}) {
  const roles = user?.roles || [user?.role];
  if (!roles.includes('DRIVER')) throw new ForbiddenError();

  const normalizedMonth = typeof month === 'string' && month.trim().length > 0
    ? month.trim()
    : null;
  if (normalizedMonth && !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(normalizedMonth)) {
    throw new BadRequestError('Định dạng tháng phải là YYYY-MM');
  }

  const isPageMode = page !== null && page !== undefined;

  if (isPageMode) {
    const total = await countDriverSessionHistory(db, user.id, { month: normalizedMonth });
    const pageNum = Number(page);
    if (!Number.isSafeInteger(pageNum) || pageNum < 1) {
      throw new BadRequestError('Số trang phải là số nguyên dương >= 1');
    }
    const pageSize = limit && Number.isSafeInteger(Number(limit)) && Number(limit) > 0
      ? Number(limit)
      : DRIVER_HISTORY_PAGE_SIZE;
    const offset = (pageNum - 1) * pageSize;
    const rows = await listDriverSessionHistory(db, user.id, {
      month: normalizedMonth,
      limit: pageSize,
      offset,
    });
    const items = rows.map(formatHistoryRow);
    const totalPages = Math.ceil(total / pageSize) || 1;
    return {
      items,
      total,
      page: pageNum,
      pageSize,
      totalPages,
    };
  }

  const decoded = decodeHistoryCursor(cursor);
  const pageSize = limit && Number.isSafeInteger(Number(limit)) && Number(limit) > 0
    ? Number(limit)
    : DRIVER_HISTORY_CURSOR_PAGE_SIZE;
  const rows = await listDriverSessionHistory(db, user.id, {
    month: normalizedMonth,
    stoppedAt: decoded?.stoppedAt || null,
    sessionId: decoded?.sessionId || null,
    limit: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const items = pageRows.map(formatHistoryRow);
  return {
    items,
    nextCursor: hasMore ? encodeHistoryCursor(pageRows[pageRows.length - 1]) : null,
  };
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

async function getUnexpectedSessions(options = {}) {
  const db = options?.query ? options : options?.db || null;
  return (await listUnexpectedSessions(db)).map(formatSession);
}

async function writeRemoteStopAudit(actorId, sessionId, result, metadata = {}, ip = null) {
  const audit = require('../audit/audit.repository');
  await audit.ghi_nhat_ky(actorId, 'REMOTE_STOP', 'charging_session', sessionId, metadata, result, ip);
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
    await writeRemoteStopAudit(actor.id, sessionId, 'OFFLINE', { requested_at: requestedAt }, ip);
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
    await writeRemoteStopAudit(actor.id, sessionId, 'ACCEPTED', {
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
      await writeRemoteStopAudit(actor.id, sessionId, 'OFFLINE', {
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
    await writeRemoteStopAudit(actor.id, sessionId, result, {
      requested_at: new Date(claim.requestedAt).toISOString(),
      error_code: error.code || null,
    }, ip);
    if (error instanceof ServiceUnavailableError) throw error;
    throw error;
  }
}

async function closeUnexpectedSession(actor, sessionId, reason, {
  ip = null,
  db = null,
  allowZeroEnergy = false,
  finalizeSession = null,
  logError = console.error,
} = {}) {
  const client = db || require('../../db/pool').pool;
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  if (!normalizedReason || normalizedReason.length > 1000) {
    throw new AppError(400, 'INVALID_MANUAL_CLOSE_REASON', 'Lý do đóng phiên phải có từ 1 đến 1000 ký tự');
  }

  const closed = await withTransaction(async (tx) => {
    const selected = await tx.query(
      `SELECT id, driver_id, meter_start, review_reason
       FROM charging_sessions
       WHERE id = $1 AND status = 'ABNORMAL'
       FOR UPDATE`,
      [sessionId]
    );
    const session = selected.rows[0];
    if (!session) {
      const existing = await tx.query('SELECT status FROM charging_sessions WHERE id = $1', [sessionId]);
      if (!existing.rows[0]) throw new NotFoundError('Không tìm thấy phiên sạc');
      throw new ConflictError('Phiên sạc không còn nằm trong danh sách bất thường');
    }

    const latest = await tx.query(
      `SELECT value, COALESCE(raw_unit, unit) AS unit
       FROM meter_values
       WHERE session_id = $1
         AND measurand = 'Energy.Active.Import.Register'
         AND (phase IS NULL OR phase = '')
       ORDER BY sampled_at DESC, id DESC
       LIMIT 1`,
      [sessionId]
    );

    let meterStop;
    if (!latest.rows[0]) {
      if (allowZeroEnergy) {
        meterStop = Number(session.meter_start);
      } else {
        throw new AppError(409, 'FINAL_METER_READING_UNAVAILABLE', 'Không thể đóng phiên vì chưa có số đo năng lượng cuối cùng hợp lệ');
      }
    } else {
      try {
        meterStop = meterValueToWh(latest.rows[0]);
      } catch {
        throw new AppError(409, 'FINAL_METER_READING_INVALID', 'Không thể đóng phiên vì số đo năng lượng cuối cùng không hợp lệ');
      }
    }
    const meterStart = Number(session.meter_start);
    if (!Number.isSafeInteger(meterStart) || !Number.isSafeInteger(meterStop) || meterStop < meterStart) {
      throw new AppError(409, 'FINAL_METER_READING_INVALID', 'Không thể đóng phiên vì số đo năng lượng cuối cùng không hợp lệ');
    }

    const energyKwh = (meterStop - meterStart) / 1000;
    await tx.query(
      `UPDATE charging_sessions
       SET meter_stop = $2,
           stopped_at = CURRENT_TIMESTAMP,
           stop_reason = 'Other',
           status = 'COMPLETED',
           remote_stop_status = CASE WHEN remote_stop_status IN ('SENDING', 'ACCEPTED', 'ERROR', 'TIMED_OUT') THEN 'STOPPED' ELSE remote_stop_status END,
           remote_stop_completed_at = CASE WHEN remote_stop_status IN ('SENDING', 'ACCEPTED', 'ERROR', 'TIMED_OUT') THEN CURRENT_TIMESTAMP ELSE remote_stop_completed_at END,
           needs_review = FALSE,
           review_reason = NULL,
           manual_close_reason = $3,
           manual_closed_by = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'ABNORMAL'`,
      [sessionId, meterStop, normalizedReason, actor.id]
    );
    await require('../audit/audit.repository').ghi_nhat_ky(
      actor.id,
      'SESSION_MANUALLY_CLOSED',
      'charging_session',
      sessionId,
      {
        meter_start_wh: meterStart,
        meter_stop_wh: meterStop,
        energy_kwh: energyKwh,
        reason: normalizedReason,
        previous_review_reason: session.review_reason || null,
      },
      'COMPLETED',
      ip,
      tx
    );

    return { id: session.id, driverId: session.driver_id, meterStop, energyKwh };
  }, client);

  void require('./sessions.events')
    .publishSessionUpdateFromDb(closed.id, { pool: client, driverId: closed.driverId });
  const finalize = finalizeSession || require('../billing/finalize-session').finalizeSession;
  void Promise.resolve()
    .then(() => finalize(closed.id))
    .catch((error) => {
      logError(
        `[Billing] Không thể kích hoạt lập hóa đơn cho phiên ${closed.id}:`,
        sanitizeErrorMessage(error?.message || error)
      );
    });

  return {
    id: Number(closed.id),
    status: 'COMPLETED',
    meter_stop: closed.meterStop,
    current_kwh: closed.energyKwh,
  };
}

module.exports = {
  getCurrentSessionForDriver,
  getDriverSessionHistory,
  getSessionById,
  getActiveSessions,
  getUnexpectedSessions,
  closeUnexpectedSession,
  requestRemoteStop,
  formatSession,
};
