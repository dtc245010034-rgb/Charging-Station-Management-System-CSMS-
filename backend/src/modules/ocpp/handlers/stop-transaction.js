const { safeLog, sanitizeErrorMessage } = require('../../../lib/constants');
const { OcppCallError } = require('../frames');
const { maskIdTag } = require('./authorize');
const { createMeterValuesHandler } = require('./meter-values');

const MAX_TRANSACTION_ID = 2147483647;
const MAX_ID_TAG_LENGTH = 20;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
const STOP_REASONS = new Set([
  'DeAuthorized',
  'EmergencyStop',
  'EVDisconnected',
  'HardReset',
  'Local',
  'Other',
  'PowerLoss',
  'Reboot',
  'Remote',
  'SoftReset',
  'UnlockCommand',
]);

function getDefaultPool() {
  return require('../../../db/pool').ocppPool;
}

function violation(message) {
  return new OcppCallError('PropertyConstraintViolation', message);
}

function validatePayload(payload) {
  if (!Number.isSafeInteger(payload?.transactionId) || payload.transactionId < 0 || payload.transactionId > MAX_TRANSACTION_ID) {
    throw violation('transactionId must be a non-negative 32-bit integer');
  }
  if (!Number.isSafeInteger(payload?.meterStop) || payload.meterStop < 0) {
    throw violation('meterStop must be a non-negative integer');
  }
  if (typeof payload?.timestamp !== 'string' || !Number.isFinite(Date.parse(payload.timestamp))) {
    throw violation('timestamp must be a valid date-time string');
  }
  if (payload.reason !== undefined && !STOP_REASONS.has(payload.reason)) {
    throw violation('reason must be a valid StopTransaction reason');
  }
  if (payload.idTag !== undefined && (typeof payload.idTag !== 'string' || payload.idTag.length > MAX_ID_TAG_LENGTH)) {
    throw violation(`idTag must be a string of at most ${MAX_ID_TAG_LENGTH} characters`);
  }
}

function createStopTransactionHandler({
  pool = null,
  now = Date.now,
  logWarning = console.warn,
  logError = console.error,
  persistTransactionData = null,
} = {}) {
  const handleMeterValues = createMeterValuesHandler({ pool, now, logWarning, logError });
  const saveTransactionData = persistTransactionData || handleMeterValues;

  return async function handleStopTransaction(payload, { connection, messageId } = {}) {
    validatePayload(payload);

    const chargePointId = connection?.chargePoint?.id;
    const code = connection?.chargePointCode || connection?.chargePoint?.code;
    const validChargePointId = chargePointId !== undefined
      && chargePointId !== null
      && /^\d+$/.test(String(chargePointId))
      && BigInt(String(chargePointId)) > 0n;
    if (!validChargePointId || !code) {
      logError(`[OCPP] StopTransaction: Thiếu thông tin trụ từ kết nối | chargePoint: ${safeLog(code || 'unknown')}`);
      throw new OcppCallError('InternalError', 'Internal error');
    }

    const currentTime = now();
    const receivedAt = currentTime instanceof Date ? currentTime.getTime() : Number(currentTime);
    const reportedAt = Date.parse(payload.timestamp);
    const timestampTrusted = Math.abs(reportedAt - receivedAt) <= MAX_CLOCK_SKEW_MS;
    const stoppedAt = timestampTrusted ? new Date(reportedAt).toISOString() : new Date(receivedAt).toISOString();
    const stopReason = payload.reason || 'Local';
    const orphanPayload = { ...payload };
    if (typeof orphanPayload.idTag === 'string') orphanPayload.idTag = maskIdTag(orphanPayload.idTag);

    const db = pool || getDefaultPool();

    async function recordOrphan(reason) {
      await db.query(
        `INSERT INTO orphan_messages (charge_point_id, action, payload, reason)
         VALUES ($1, 'StopTransaction', $2::jsonb, $3)`,
        [chargePointId, JSON.stringify(orphanPayload), reason]
      );
      logWarning(`[OCPP] StopTransaction bị cách ly | chargePoint: ${safeLog(code)} | transactionId: ${payload.transactionId} | reason: ${reason}`);
    }

    try {
      let transactionDataFailed = false;
      if (Array.isArray(payload.transactionData) && payload.transactionData.length > 0) {
        const activeSession = await db.query(
          `SELECT connector_no
           FROM charging_sessions
           WHERE id = $1
             AND charge_point_id = $2
             AND status = 'CHARGING'`,
          [payload.transactionId, chargePointId]
        );
        if (activeSession.rowCount > 0) {
          try {
            await saveTransactionData(
              {
                connectorId: activeSession.rows[0].connector_no,
                transactionId: payload.transactionId,
                meterValue: payload.transactionData,
              },
              { connection, messageId }
            );
          } catch (error) {
            transactionDataFailed = true;
            logWarning(
              `[OCPP] StopTransaction: Không thể lưu transactionData của trụ ${safeLog(code)} | transactionId: ${payload.transactionId}:`,
              sanitizeErrorMessage(error?.message || error)
            );
          }
        }
      }

      const updated = await db.query(
        `UPDATE charging_sessions
         SET meter_stop = $2,
             stopped_at = $3::timestamptz,
             stop_reason = $4,
             status = 'COMPLETED',
             needs_review = needs_review OR meter_start > $2 OR $5::boolean OR $8::boolean,
             review_reason = NULLIF(concat_ws('; ',
               NULLIF(review_reason, ''),
               CASE WHEN position('METER_STOP_BELOW_START' IN COALESCE(review_reason, '')) = 0 AND meter_start > $2 THEN 'METER_STOP_BELOW_START' END,
               CASE WHEN position('CLOCK_SKEW' IN COALESCE(review_reason, '')) = 0 AND $5::boolean THEN 'CLOCK_SKEW' END,
               CASE WHEN position('INVALID_TRANSACTION_DATA' IN COALESCE(review_reason, '')) = 0 AND $8::boolean THEN 'INVALID_TRANSACTION_DATA' END
             ), ''),
             transaction_data = $7::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND charge_point_id = $6
           AND status = 'CHARGING'
         RETURNING id`,
        [
          payload.transactionId,
          payload.meterStop,
          stoppedAt,
          stopReason,
          !timestampTrusted,
          chargePointId,
          payload.transactionData == null ? null : JSON.stringify(payload.transactionData),
          transactionDataFailed,
        ]
      );

      if (updated.rowCount > 0) {
        return {};
      }

      const existing = await db.query(
        'SELECT charge_point_id, status FROM charging_sessions WHERE id = $1',
        [payload.transactionId]
      );
      if (existing.rowCount === 0) {
        await recordOrphan('UNKNOWN_TRANSACTION');
      } else if (String(existing.rows[0].charge_point_id) !== String(chargePointId)) {
        await recordOrphan('CHARGE_POINT_MISMATCH');
      }
      return {};
    } catch (error) {
      if (error instanceof OcppCallError) throw error;
      logError(
        `[OCPP] StopTransaction: Lỗi xử lý phiên của trụ ${safeLog(code)} | transactionId: ${payload.transactionId}:`,
        sanitizeErrorMessage(error?.message || error)
      );
      throw new OcppCallError('InternalError', 'Internal error');
    }
  };
}

module.exports = { createStopTransactionHandler, STOP_REASONS };
