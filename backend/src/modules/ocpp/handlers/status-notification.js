const { safeLog, sanitizeErrorMessage } = require('../../../lib/constants');
const { OcppCallError } = require('../frames');
const { mapOcppConnectorStatus, OCPP_CONNECTOR_STATUS_MAP } = require('../../connectors/status-mapping');

function getDefaultPool() {
  return require('../../../db/pool').pool;
}

function createStatusNotificationHandler({
  pool = null,
  logWarning = console.warn,
  logError = console.error,
  now = Date.now,
  missingConnectorWarningIntervalMs = 60000,
} = {}) {
  const missingConnectorWarnings = new Map();

  function warnMissingConnector(code, connectorId) {
    const currentTime = now();
    const warning = missingConnectorWarnings.get(code) || { lastLoggedAt: null, connectorIds: new Set() };
    warning.connectorIds.add(connectorId);
    if (warning.lastLoggedAt !== null && currentTime - warning.lastLoggedAt < missingConnectorWarningIntervalMs) {
      missingConnectorWarnings.set(code, warning);
      return;
    }
    const connectorIds = [...warning.connectorIds].sort((left, right) => left - right);
    logWarning(`[OCPP] StatusNotification: Không tìm thấy đầu nối của trụ ${safeLog(code)} | connectorId: ${connectorIds.join(', ')}`);
    missingConnectorWarnings.set(code, { lastLoggedAt: currentTime, connectorIds: new Set() });
  }

  return async function handleStatusNotification(payload, { connection } = {}) {
    const connectorId = payload?.connectorId;
    const status = payload?.status;

    if (!Number.isInteger(connectorId) || connectorId < 0) {
      throw new OcppCallError('PropertyConstraintViolation', 'connectorId must be a non-negative integer');
    }
    if (typeof status !== 'string' || status.length === 0) {
      throw new OcppCallError('PropertyConstraintViolation', 'status must be a non-empty string');
    }

    if (connectorId === 0) return {};

    const code = connection?.chargePointCode || connection?.chargePoint?.code;
    if (!code) {
      throw new OcppCallError('InternalError', 'Internal error');
    }

    const db = pool || getDefaultPool();
    const internalStatus = mapOcppConnectorStatus(status);
    try {
      const result = await db.query(
        `UPDATE connectors c
         SET status = $1,
             ocpp_status = $2,
             updated_at = CURRENT_TIMESTAMP
         FROM charge_points cp
         WHERE cp.id = c.charge_point_id
           AND cp.code = $3
           AND c.connector_no = $4`,
        [internalStatus, status, code, connectorId]
      );
      if (result.rowCount === 0) {
        warnMissingConnector(code, connectorId);
      } else {
        if (!Object.hasOwn(OCPP_CONNECTOR_STATUS_MAP, status)) {
          logWarning(`[OCPP] StatusNotification: Trạng thái OCPP chưa biết ${safeLog(status)} cho trụ ${safeLog(code)}`);
        }
        if (typeof payload.errorCode === 'string' && payload.errorCode !== 'NoError') {
          const occurredAt = typeof payload.timestamp === 'string' && Number.isFinite(Date.parse(payload.timestamp))
            ? new Date(payload.timestamp).toISOString()
            : null;
          await db.query(
            `INSERT INTO connector_errors (connector_id, error_code, vendor_error_code, occurred_at)
             SELECT c.id, $1, $2, COALESCE($3::timestamptz, CURRENT_TIMESTAMP)
             FROM connectors c
             JOIN charge_points cp ON cp.id = c.charge_point_id
             WHERE cp.code = $4 AND c.connector_no = $5`,
            [
              payload.errorCode,
              typeof payload.vendorErrorCode === 'string' && payload.vendorErrorCode ? payload.vendorErrorCode : null,
              occurredAt,
              code,
              connectorId,
            ]
          );
        }
      }
    } catch (error) {
      logError(`[OCPP] StatusNotification: Lỗi cập nhật trạng thái đầu nối của trụ ${safeLog(code)}:`, sanitizeErrorMessage(error?.message || error));
      throw new OcppCallError('InternalError', 'Internal error');
    }

    return {};
  };
}

let defaultHandler = null;

function getDefaultHandler() {
  if (!defaultHandler) {
    defaultHandler = createStatusNotificationHandler({ pool: getDefaultPool() });
  }
  return defaultHandler;
}

module.exports = {
  createStatusNotificationHandler,
  get statusNotificationHandler() {
    return getDefaultHandler();
  },
};
