const { safeLog, sanitizeErrorMessage } = require('../../../lib/constants');
const { OcppCallError } = require('../frames');
const { recordMeterValues } = require('../../sessions/meter-values.repository');

const MAX_CONNECTOR_ID = 2147483647;
const MAX_TRANSACTION_ID = 2147483647;
const MAX_UNIT_LENGTH = 20;
const SUPPORTED_MEASURANDS = new Set([
  'Energy.Active.Import.Register',
  'Power.Active.Import',
  'Current.Import',
]);
const DEFAULT_UNITS = {
  'Energy.Active.Import.Register': 'Wh',
  'Power.Active.Import': 'W',
  'Current.Import': 'A',
};
const DECIMAL_VALUE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function getDefaultPool() {
  return require('../../../db/pool').ocppPool;
}

function violation(message) {
  return new OcppCallError('PropertyConstraintViolation', message);
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OcppCallError('FormationViolation', 'Payload must be an object');
  }
  if (!Number.isInteger(payload.connectorId) || payload.connectorId < 0 || payload.connectorId > MAX_CONNECTOR_ID) {
    throw violation('connectorId must be an integer between 0 and 2147483647');
  }
  if (payload.transactionId !== undefined
    && (!Number.isInteger(payload.transactionId) || payload.transactionId < 0 || payload.transactionId > MAX_TRANSACTION_ID)) {
    throw violation('transactionId must be an integer between 0 and 2147483647');
  }
  if (!Array.isArray(payload.meterValue) || payload.meterValue.length === 0) {
    throw violation('meterValue must be a non-empty array');
  }

  const readings = [];
  for (const meterValue of payload.meterValue) {
    if (!meterValue || typeof meterValue !== 'object' || Array.isArray(meterValue)
      || typeof meterValue.timestamp !== 'string' || !Number.isFinite(Date.parse(meterValue.timestamp))
      || !Array.isArray(meterValue.sampledValue)) {
      throw violation('Each meterValue must contain a valid timestamp and sampledValue array');
    }

    for (const sampledValue of meterValue.sampledValue) {
      if (!sampledValue || typeof sampledValue !== 'object' || Array.isArray(sampledValue)) {
        throw violation('Each sampledValue must be an object');
      }
      const measurand = sampledValue.measurand || 'Energy.Active.Import.Register';
      if (!SUPPORTED_MEASURANDS.has(measurand)) continue;
      if (typeof sampledValue.value !== 'string'
        || !DECIMAL_VALUE.test(sampledValue.value)
        || !Number.isFinite(Number(sampledValue.value))) {
        throw violation('Supported sampledValue.value must be a finite numeric string');
      }
      const unit = sampledValue.unit === undefined ? DEFAULT_UNITS[measurand] : sampledValue.unit;
      if (typeof unit !== 'string' || unit.length === 0 || unit.length > MAX_UNIT_LENGTH) {
        throw violation(`sampledValue.unit must be a string of at most ${MAX_UNIT_LENGTH} characters`);
      }
      readings.push({
        sampledAt: new Date(meterValue.timestamp).toISOString(),
        measurand,
        value: sampledValue.value,
        unit,
      });
    }
  }
  return readings;
}

function createMeterValuesHandler({
  pool = null,
  logWarning = console.warn,
  logError = console.error,
} = {}) {
  return async function handleMeterValues(payload, { connection, afterResponse } = {}) {
    const readings = validatePayload(payload);
    if (readings.length === 0) return {};

    const chargePointId = connection?.chargePoint?.id;
    const code = connection?.chargePointCode || connection?.chargePoint?.code;
    if (chargePointId === undefined || chargePointId === null || !code) {
      logError(`[OCPP] MeterValues: Thiếu thông tin trụ từ kết nối | chargePoint: ${safeLog(code || 'unknown')}`);
      throw new OcppCallError('InternalError', 'Charge point not identified');
    }

      const defer = afterResponse || ((callback) => setImmediate(callback));
      defer(() => {
        void persistMeterValues({
          db: pool || getDefaultPool(),
          chargePointId,
          code,
          payload,
          readings,
          logWarning,
          logError,
        }).catch((error) => {
          logError(
            `[OCPP] MeterValues: Lỗi khởi chạy lưu số đo của trụ ${safeLog(code)}:`,
            sanitizeErrorMessage(error?.message || error)
          );
        });
      });
      return {};
  };
}

async function persistMeterValues({ db, chargePointId, code, payload, readings, logWarning, logError }) {
  try {
    const connector = await db.query(
      `SELECT c.id AS connector_id, cs.id AS session_id
       FROM connectors c
       LEFT JOIN charging_sessions cs
         ON cs.connector_id = c.id
        AND cs.status = 'CHARGING'
        AND ($3::integer IS NULL OR cs.id = $3)
       WHERE c.charge_point_id = $1
         AND c.connector_no = $2
       LIMIT 1`,
      [chargePointId, payload.connectorId, payload.transactionId ?? null]
    );
    const sessionId = connector.rows[0]?.session_id;

    if (!sessionId) {
      const reason = connector.rowCount === 0 ? 'UNDECLARED_CONNECTOR' : 'NO_ACTIVE_SESSION';
      await db.query(
        `INSERT INTO orphan_messages (charge_point_id, action, payload, reason)
         VALUES ($1, 'MeterValues', $2::jsonb, $3)`,
        [chargePointId, JSON.stringify(payload), reason]
      );
      logWarning(
        `[OCPP] MeterValues bị cách ly | chargePoint: ${safeLog(code)} | connectorId: ${payload.connectorId} | reason: ${reason}`
      );
      return;
    }

    await recordMeterValues(db, sessionId, readings);
  } catch (error) {
    logError(
      `[OCPP] MeterValues: Lỗi lưu số đo của trụ ${safeLog(code)} | connectorId: ${payload.connectorId}:`,
      sanitizeErrorMessage(error?.message || error)
    );
  }
}

module.exports = { createMeterValuesHandler, validatePayload, SUPPORTED_MEASURANDS };
