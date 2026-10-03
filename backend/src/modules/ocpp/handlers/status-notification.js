const { safeLog, sanitizeErrorMessage } = require('../../../lib/constants');
const { OcppCallError } = require('../frames');
const { mapOcppConnectorStatus, OCPP_CONNECTOR_STATUS_MAP } = require('../../connectors/status-mapping');
const { publish } = require('../../fleet-status/fleet-status.events');

const MAX_TEXT_LENGTH = 50;
const MAX_CONNECTOR_ID = 2147483647;
const MAX_CLOCK_SKEW_MS = 24 * 3600 * 1000;
const OTHER_ERROR = 'OtherError';
const OCPP_ERROR_CODES = new Set([
  'ConnectorLockFailure', 'EVCommunicationError', 'GroundFailure', 'HighTemperature', 'InternalError', 'LocalListConflict',
  'NoError', OTHER_ERROR, 'OverCurrentFailure', 'PowerMeterFailure', 'PowerSwitchFailure', 'ReaderFailure', 'ResetFailure',
  'UnderVoltage', 'OverVoltage', 'WeakSignal',
]);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function getDefaultPool() {
  return require('../../../db/pool').pool;
}

function violation(message) {
  return new OcppCallError('PropertyConstraintViolation', message);
}

function requireShortText(payload, field) {
  const value = payload[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
    throw violation(`${field} must be a string of at most ${MAX_TEXT_LENGTH} characters`);
  }
  return value;
}

function createStatusNotificationHandler({
  pool = null,
  logWarning = console.warn,
  logInfo = console.info,
  logError = console.error,
  now = Date.now,
  warningIntervalMs = 60000,
  errorDedupSeconds = 60,
} = {}) {
  const aggregatedLogs = new Map();
  const exclusiveQueues = new Map();

  // Gom log theo (loại, trụ): ghi ngay lần đầu, các giá trị gặp trong cửa sổ được gộp vào dòng ghi kế tiếp.
  function logAggregated(log, kind, code, message, value) {
    const key = `${kind}:${code}`;
    const currentTime = now();
    const entry = aggregatedLogs.get(key) || { lastLoggedAt: null, values: new Set() };
    entry.values.add(value);
    if (entry.lastLoggedAt !== null && currentTime - entry.lastLoggedAt < warningIntervalMs) {
      aggregatedLogs.set(key, entry);
      return;
    }
    const values = [...entry.values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    log(`${message}: ${values.join(', ')}`);
    aggregatedLogs.set(key, { lastLoggedAt: currentTime, values: new Set() });
  }

  // Các tin của cùng một đầu nối được xử lý lần lượt, để khử trùng không bị đua khi trụ gửi dồn dập.
  function runExclusive(key, task) {
    const next = (exclusiveQueues.get(key) || Promise.resolve()).then(task, task);
    exclusiveQueues.set(key, next);
    const release = () => { if (exclusiveQueues.get(key) === next) exclusiveQueues.delete(key); };
    next.then(release, release);
    return next;
  }

  async function record(db, code, connectorId, payload, status, errorCode) {
    const internalStatus = mapOcppConnectorStatus(status);
    const result = await db.query(
      `UPDATE connectors c
       SET status = $1,
           ocpp_status = $2,
           updated_at = CURRENT_TIMESTAMP
       FROM charge_points cp
       JOIN stations s ON s.id = cp.station_id, connectors previous
       WHERE cp.id = c.charge_point_id
         AND cp.code = $3
         AND c.connector_no = $4
         AND previous.id = c.id
       RETURNING previous.ocpp_status AS previous_ocpp_status,
                 (previous.status IS DISTINCT FROM $1 OR previous.ocpp_status IS DISTINCT FROM $2) AS changed,
                 c.id AS connector_id, cp.id AS charge_point_id, cp.station_id, s.owner_id`,
      [internalStatus, status, code, connectorId]
    );
    if (result.rowCount === 0) {
      logAggregated(logWarning, 'missing-connector', code, `[OCPP] StatusNotification: Không tìm thấy đầu nối của trụ ${safeLog(code)} | connectorId`, connectorId);
      return;
    }
    const updated = result.rows?.[0];
    if (updated?.changed) {
      publish({
        ownerId: updated.owner_id,
        stationId: updated.station_id,
        chargePointId: updated.charge_point_id,
        connectorId: updated.connector_id,
      });
    }
    if (!Object.hasOwn(OCPP_CONNECTOR_STATUS_MAP, status)) {
      logAggregated(logWarning, 'unknown-status', code, `[OCPP] StatusNotification: Trạng thái OCPP chưa biết của trụ ${safeLog(code)} | status`, safeLog(status));
    }
    if (errorCode === undefined || errorCode === 'NoError') return;

    const knownCode = OCPP_ERROR_CODES.has(errorCode);
    if (!knownCode) {
      logAggregated(logWarning, 'unknown-error-code', code, `[OCPP] StatusNotification: errorCode ngoài danh sách OCPP 1.6 của trụ ${safeLog(code)} | errorCode`, safeLog(errorCode));
    }
    const vendorErrorCode = payload.vendorErrorCode || (knownCode ? null : errorCode);
    // Đồng hồ trụ lệch quá 24 giờ (hoặc năm cực đoan Postgres không nhận) thì dùng giờ máy chủ thay vì tin hay báo lỗi.
    const reportedAt = typeof payload.timestamp === 'string' ? Date.parse(payload.timestamp) : NaN;
    const occurredAt = Number.isFinite(reportedAt) && Math.abs(reportedAt - now()) <= MAX_CLOCK_SKEW_MS
      ? new Date(reportedAt).toISOString()
      : null;
    const sameStatusAsBefore = result.rows?.[0]?.previous_ocpp_status === status;
    await db.query(
      `INSERT INTO connector_errors (connector_id, error_code, vendor_error_code, occurred_at)
       SELECT c.id, $1::text, $2::text, COALESCE($3::timestamptz, CURRENT_TIMESTAMP)
       FROM connectors c
       JOIN charge_points cp ON cp.id = c.charge_point_id
       WHERE cp.code = $4 AND c.connector_no = $5
         AND NOT ($7::boolean AND $6::int > 0 AND EXISTS (
           SELECT 1 FROM connector_errors e
           WHERE e.connector_id = c.id
             AND e.error_code = $1::text
             AND e.vendor_error_code IS NOT DISTINCT FROM $2::text
             AND e.recorded_at > CURRENT_TIMESTAMP - make_interval(secs => $6::int)
         ))`,
      [knownCode ? errorCode : OTHER_ERROR, vendorErrorCode, occurredAt, code, connectorId, errorDedupSeconds, sameStatusAsBefore]
    );
  }

  return async function handleStatusNotification(payload, { connection } = {}) {
    const connectorId = payload?.connectorId;
    const rawStatus = payload?.status;

    if (!Number.isInteger(connectorId) || connectorId < 0 || connectorId > MAX_CONNECTOR_ID) {
      throw violation('connectorId must be a non-negative 32-bit integer');
    }
    if (typeof rawStatus !== 'string' || rawStatus.length === 0 || rawStatus.length > MAX_TEXT_LENGTH) {
      throw violation(`status must be a non-empty string of at most ${MAX_TEXT_LENGTH} characters`);
    }
    const status = rawStatus.replace(CONTROL_CHARACTERS, '');
    if (status.length === 0) {
      throw violation('status must contain printable characters');
    }
    const errorCode = requireShortText(payload, 'errorCode');
    requireShortText(payload, 'vendorErrorCode');
    requireShortText(payload, 'info');
    requireShortText(payload, 'vendorId');

    const code = connection?.chargePointCode || connection?.chargePoint?.code;

    if (connectorId === 0) {
      logAggregated(logInfo, 'station-level-status', code ?? 'UNKNOWN', `[OCPP] StatusNotification: Bỏ qua trạng thái mức trụ (connectorId 0) của trụ ${safeLog(code ?? 'UNKNOWN')}, chưa lưu | status`, safeLog(status));
      return {};
    }
    if (!code) {
      throw new OcppCallError('InternalError', 'Internal error');
    }

    const db = pool || getDefaultPool();
    try {
      await runExclusive(`${code}:${connectorId}`, () => record(db, code, connectorId, payload, status, errorCode));
    } catch (error) {
      logError(`[OCPP] StatusNotification: Lỗi cập nhật trạng thái đầu nối của trụ ${safeLog(code)}:`, sanitizeErrorMessage(error?.message || error));
      throw new OcppCallError('InternalError', 'Internal error');
    }

    return {};
  };
}

module.exports = { createStatusNotificationHandler };
