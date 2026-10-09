const { safeLog, sanitizeErrorMessage } = require('../../../lib/constants');
const { OcppCallError } = require('../frames');
const { withTransaction } = require('../../../db/tx');
const {
  findLatestMeterValues,
  recordMeterValues,
} = require('../../sessions/meter-values.repository');
const {
  evaluateMeterReading,
  isPlausibleMeterValue,
} = require('../../sessions/meter-rules');
const { publishSessionUpdateFromDb } = require('../../sessions/sessions.events');

const MAX_CONNECTOR_ID = 2147483647;
const MAX_TRANSACTION_ID = 2147483647;
const MAX_UNIT_LENGTH = 20;
const MAX_METER_VALUES = 100;
const MAX_SAMPLED_VALUES = 50;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
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
function getDefaultPool() {
  return require('../../../db/pool').ocppPool;
}

function violation(message) {
  return new OcppCallError('PropertyConstraintViolation', message);
}

function validatePayload(payload, now = Date.now) {
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
  if (payload.meterValue.length > MAX_METER_VALUES) {
    throw violation(`meterValue array must contain at most ${MAX_METER_VALUES} items`);
  }

  const currentTime = typeof now === 'function' ? now() : Date.now();
  const receivedAt = currentTime instanceof Date
    ? currentTime.getTime()
    : (typeof currentTime === 'string' && Number.isFinite(Date.parse(currentTime))
      ? Date.parse(currentTime)
      : Number(currentTime));

  let hasClockSkew = false;
  const readings = [];

  for (const meterValue of payload.meterValue) {
    if (!meterValue || typeof meterValue !== 'object' || Array.isArray(meterValue)
      || typeof meterValue.timestamp !== 'string' || !Number.isFinite(Date.parse(meterValue.timestamp))
      || !Array.isArray(meterValue.sampledValue)) {
      throw violation('Each meterValue must contain a valid timestamp and sampledValue array');
    }
    if (meterValue.sampledValue.length > MAX_SAMPLED_VALUES) {
      throw violation(`sampledValue array must contain at most ${MAX_SAMPLED_VALUES} items`);
    }

    const reportedAt = Date.parse(meterValue.timestamp);
    const isSkewed = Math.abs(reportedAt - receivedAt) > MAX_CLOCK_SKEW_MS;
    if (isSkewed) {
      hasClockSkew = true;
    }
    const sampledAt = isSkewed
      ? new Date(receivedAt).toISOString()
      : new Date(reportedAt).toISOString();

    for (const sampledValue of meterValue.sampledValue) {
      if (!sampledValue || typeof sampledValue !== 'object' || Array.isArray(sampledValue)) {
        throw violation('Each sampledValue must be an object');
      }
      const measurand = sampledValue.measurand || 'Energy.Active.Import.Register';
      if (!SUPPORTED_MEASURANDS.has(measurand)) continue;
      if (!isPlausibleMeterValue(
        sampledValue.value,
        measurand,
        sampledValue.unit || DEFAULT_UNITS[measurand]
      )) {
        throw violation('Supported sampledValue.value must be a plausible non-negative numeric string');
      }
      const unit = sampledValue.unit === undefined ? DEFAULT_UNITS[measurand] : sampledValue.unit;
      if (typeof unit !== 'string' || unit.length === 0 || unit.length > MAX_UNIT_LENGTH) {
        throw violation(`sampledValue.unit must be a string of at most ${MAX_UNIT_LENGTH} characters`);
      }
      const phase = sampledValue.phase == null ? '' : sampledValue.phase;
      const context = sampledValue.context == null ? '' : sampledValue.context;
      if (phase !== '' && (typeof phase !== 'string' || phase.length === 0 || phase.length > 20)) {
        throw violation('sampledValue.phase must be a non-empty string of at most 20 characters');
      }
      if (context !== '' && (typeof context !== 'string' || context.length > 200)) {
        throw violation('sampledValue.context must be a string of at most 200 characters');
      }
      readings.push({
        reportedAt: new Date(reportedAt).toISOString(),
        sampledAt,
        measurand,
        value: sampledValue.value,
        unit,
        phase,
        context,
      });
      Object.defineProperty(readings[readings.length - 1], 'clockSkew', {
        value: isSkewed,
      });
    }
  }

  Object.defineProperty(readings, 'hasClockSkew', {
    value: hasClockSkew,
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return readings;
}

function createMeterValuesHandler({
  pool = null,
  now = Date.now,
  logWarning = console.warn,
  logError = console.error,
} = {}) {
  return async function handleMeterValues(payload, { connection, messageId } = {}) {
    const readings = validatePayload(payload, now);
    if (readings.length === 0) return {};

    const chargePointId = connection?.chargePoint?.id;
    const code = connection?.chargePointCode || connection?.chargePoint?.code;
    if (chargePointId === undefined || chargePointId === null || !code) {
      logError(`[OCPP] MeterValues: Thiếu thông tin trụ từ kết nối | chargePoint: ${safeLog(code || 'unknown')}`);
      throw new OcppCallError('InternalError', 'Charge point not identified');
    }

    // D5: Ghi đồng bộ bằng một câu INSERT nhiều dòng rồi mới trả lời (không "trả lời trước, ghi sau")
    await persistMeterValues({
      db: pool || getDefaultPool(),
      chargePointId,
      code,
      payload,
      readings,
      sourceMessageId: messageId,
      hasClockSkew: readings.hasClockSkew,
      logWarning,
      logError,
    });

    return {};
  };
}

async function persistMeterValues({
  db,
  chargePointId,
  code,
  payload,
  readings,
  sourceMessageId,
  hasClockSkew,
  logWarning,
  logError,
}) {
  try {
    const outcome = await withTransaction(async (client) => {
      const connector = await client.query(
        `SELECT c.id AS connector_id, cs.id AS session_id
         FROM connectors c
         LEFT JOIN charging_sessions cs
           ON cs.connector_id = c.id
          AND cs.status = 'CHARGING'
          AND ($3::integer IS NULL OR cs.id = $3)
         WHERE c.charge_point_id = $1
           AND c.connector_no = $2
         LIMIT 1
         FOR UPDATE OF c`,
        [chargePointId, payload.connectorId, payload.transactionId ?? null]
      );
      let sessionId = connector.rows[0]?.session_id;

      if (sessionId) {
        const activeSession = await client.query(
          `SELECT id FROM charging_sessions WHERE id = $1 AND status = 'CHARGING' FOR UPDATE`,
          [sessionId]
        );
        if (activeSession.rowCount === 0) sessionId = null;
      }

      if (!sessionId) {
        let reason = connector.rowCount === 0 ? 'UNDECLARED_CONNECTOR' : 'NO_ACTIVE_SESSION';
        if (payload.transactionId !== undefined && connector.rowCount > 0) {
          const checkTx = await client.query(
            `SELECT charge_point_id FROM charging_sessions WHERE id = $1`,
            [payload.transactionId]
          );
          if (checkTx.rows?.[0] && String(checkTx.rows[0].charge_point_id) !== String(chargePointId)) {
            reason = 'CHARGE_POINT_MISMATCH';
          }
        }
        await client.query(
          `INSERT INTO orphan_messages (charge_point_id, action, payload, reason)
           VALUES ($1, 'MeterValues', $2::jsonb, $3)`,
          [chargePointId, JSON.stringify(payload), reason]
        );
        return { orphanReason: reason, ignored: [], reviewReasons: [] };
      }

      const latestRows = await findLatestMeterValues(client, sessionId);
      const latestByStream = new Map(
        latestRows.map((row) => [streamKey(row), row])
      );
      const accepted = [];
      const ignored = new Set();
      const reviewReasons = new Set();

      const readingsInTimeOrder = [...readings].sort(
        (left, right) => Date.parse(left.sampledAt) - Date.parse(right.sampledAt)
      );
      for (const reading of readingsInTimeOrder) {
        const key = streamKey(reading);
        const decision = evaluateMeterReading(latestByStream.get(key), reading);
        if (decision.action === 'ignore') {
          if (decision.reason !== 'DUPLICATE') ignored.add(decision.reason);
          continue;
        }
        if (decision.action === 'review') reviewReasons.add(decision.reason);

        const storedReading = { ...reading, sourceMessageId };
        accepted.push(storedReading);
        if (!reading.clockSkew) {
          latestByStream.set(key, {
            ...storedReading,
            sampled_at: storedReading.sampledAt,
          });
        }
      }

      await recordMeterValues(client, sessionId, accepted);

      const allReviewReasons = new Set(reviewReasons);
      if (hasClockSkew) allReviewReasons.add('CLOCK_SKEW');
      for (const reason of allReviewReasons) {
        await client.query(
          `UPDATE charging_sessions
           SET needs_review = TRUE,
               review_reason = CASE
                 WHEN position($2 in COALESCE(review_reason, '')) > 0 THEN review_reason
                 ELSE concat_ws('; ', NULLIF(review_reason, ''), $2)
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [sessionId, reason]
        );
      }
      return { sessionId, ignored: [...ignored], reviewReasons: [...reviewReasons] };
    }, db);

    if (outcome?.sessionId) {
      publishSessionUpdateFromDb(outcome.sessionId, { pool: db }).catch(() => {});
    }

    if (outcome.orphanReason) {
      logWarning(
        `[OCPP] MeterValues bị cách ly | chargePoint: ${safeLog(code)} | connectorId: ${payload.connectorId} | reason: ${outcome.orphanReason}`
      );
      return;
    }
    for (const reason of outcome.ignored) {
      logWarning(
        `[OCPP] MeterValues bị bỏ qua | chargePoint: ${safeLog(code)} | connectorId: ${payload.connectorId} | reason: ${reason}`
      );
    }
    for (const reason of outcome.reviewReasons) {
      logWarning(
        `[OCPP] MeterValues cần xem xét | chargePoint: ${safeLog(code)} | session: ${outcome.sessionId} | reason: ${reason}`
      );
    }
    if (hasClockSkew) {
      logWarning(
        `[OCPP] MeterValues lệch giờ > 24h, bật needs_review | chargePoint: ${safeLog(code)} | session: ${outcome.sessionId}`
      );
    }
  } catch (error) {
    if (error instanceof OcppCallError) throw error;
    logError(
      `[OCPP] MeterValues: Lỗi lưu số đo của trụ ${safeLog(code)} | connectorId: ${payload.connectorId}:`,
      sanitizeErrorMessage(error?.message || error)
    );
    throw new OcppCallError('InternalError', 'Internal error');
  }
}

function streamKey(reading) {
  return JSON.stringify([
    reading.measurand,
    reading.phase || '',
    reading.context || '',
  ]);
}

module.exports = {
  createMeterValuesHandler,
  validatePayload,
  SUPPORTED_MEASURANDS,
  MAX_METER_VALUES,
  MAX_SAMPLED_VALUES,
  MAX_CLOCK_SKEW_MS,
};
