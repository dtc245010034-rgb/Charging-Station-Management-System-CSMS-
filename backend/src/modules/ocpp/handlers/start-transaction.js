const { safeLog, sanitizeErrorMessage } = require('../../../lib/constants');
const { withTransaction } = require('../../../db/tx');
const { OcppCallError } = require('../frames');
const { evaluateIdTag, maskIdTag, MAX_ID_TAG_LENGTH } = require('./authorize');

function getDefaultPool() {
  return require('../../../db/pool').ocppPool;
}

function createStartTransactionHandler({
  pool = null,
  now = () => new Date(),
  logWarning = console.warn,
  logError = console.error,
} = {}) {
  return async function handleStartTransaction(payload, { connection } = {}) {
    if (!Number.isSafeInteger(payload?.connectorId) || payload.connectorId < 1) {
      throw new OcppCallError('FormationViolation', 'connectorId must be a positive integer');
    }
    if (typeof payload?.idTag !== 'string' || payload.idTag.trim() === '' || payload.idTag.length > MAX_ID_TAG_LENGTH) {
      throw new OcppCallError('FormationViolation', `idTag must contain 1 to ${MAX_ID_TAG_LENGTH} characters`);
    }
    if (!Number.isSafeInteger(payload?.meterStart) || payload.meterStart < 0) {
      throw new OcppCallError('FormationViolation', 'meterStart must be a non-negative integer');
    }
    const chargerTime = typeof payload?.timestamp === 'string' ? new Date(payload.timestamp) : new Date(NaN);
    if (!Number.isFinite(chargerTime.getTime())) {
      throw new OcppCallError('FormationViolation', 'timestamp must be a valid date-time');
    }

    const code = connection?.chargePointCode || connection?.chargePoint?.code;
    if (!code) throw new OcppCallError('InternalError', 'Charge point identity is unavailable');

    const database = pool || getDefaultPool();
    const receivedAt = now();
    const startedAt = chargerTime;
    const idTag = payload.idTag.trim();
    const maskedTag = maskIdTag(idTag);
    let result;

    try {
      result = await withTransaction(async (client) => {
        const chargePointResult = await client.query(
          `SELECT cp.id AS charge_point_id, s.status, s.locked_at
           FROM charge_points cp
           JOIN stations s ON s.id = cp.station_id
           WHERE UPPER(cp.code) = UPPER($1)
           FOR UPDATE OF cp, s`,
          [code]
        );
        const chargePoint = chargePointResult.rows[0];
        if (!chargePoint) throw new OcppCallError('PropertyConstraintViolation', 'Unknown charge point');

        const connectorResult = await client.query(
          `SELECT id FROM connectors
           WHERE charge_point_id = $1 AND connector_no = $2
           FOR UPDATE`,
          [chargePoint.charge_point_id, payload.connectorId]
        );
        const connector = connectorResult.rows[0];
        if (!connector) throw new OcppCallError('PropertyConstraintViolation', 'Unknown connectorId');

        const tagResult = await client.query(
          'SELECT id, user_id, status, expires_at FROM id_tags WHERE UPPER(tag) = UPPER($1) LIMIT 1',
          [idTag]
        );
        const tagRecord = tagResult.rows[0] || null;
        const idTagStatus = evaluateIdTag({ tagRecord, station: chargePoint, now: receivedAt });
        const reviewReason = idTagStatus === 'Accepted' ? null : `ID_TAG_${idTagStatus.toUpperCase()}`;
        const sessionStatus = reviewReason ? 'NEEDS_REVIEW' : 'CHARGING';

        const existingSession = await client.query(
          `SELECT id
           FROM charging_sessions
           WHERE charge_point_id = $1
             AND connector_id = $2
             AND connector_no = $3
             AND id_tag_masked = $4
             AND meter_start = $5
             AND started_at = $6
           LIMIT 1`,
          [chargePoint.charge_point_id, connector.id, payload.connectorId, maskedTag, payload.meterStart, startedAt]
        );
        if (existingSession.rowCount > 0) {
          return { transactionId: existingSession.rows[0].id, idTagStatus, reviewReason, replaced: false, deduplicated: true };
        }

        const previous = await client.query(
          `UPDATE charging_sessions
           SET status = 'ABNORMAL', stopped_at = $2,
               stop_reason = 'START_TRANSACTION_REPLACED', updated_at = $2,
               review_reason = COALESCE(review_reason, 'REPLACED_BY_NEW_START_TRANSACTION')
           WHERE connector_id = $1 AND status IN ('CHARGING', 'NEEDS_REVIEW')
           RETURNING id`,
          [connector.id, receivedAt]
        );

        const sessionResult = await client.query(
          `INSERT INTO charging_sessions
             (charge_point_id, connector_id, connector_no, id_tag_id, id_tag_masked, driver_id,
              meter_start, started_at, status, review_reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (charge_point_id, connector_no, id_tag_masked, meter_start, started_at)
           DO NOTHING
           RETURNING id`,
          [chargePoint.charge_point_id, connector.id, payload.connectorId, tagRecord?.id || null,
            maskedTag, tagRecord?.user_id || null, payload.meterStart, startedAt,
            sessionStatus, reviewReason]
        );

        const fallbackSession = sessionResult.rows[0]?.id
          ? sessionResult.rows[0].id
          : (await client.query(
              `SELECT id
               FROM charging_sessions
               WHERE charge_point_id = $1
                 AND connector_id = $2
                 AND connector_no = $3
                 AND id_tag_masked = $4
                 AND meter_start = $5
                 AND started_at = $6
               LIMIT 1`,
              [chargePoint.charge_point_id, connector.id, payload.connectorId, maskedTag, payload.meterStart, startedAt]
            )).rows[0]?.id;

        return { transactionId: fallbackSession, idTagStatus, reviewReason, replaced: previous.rowCount > 0, deduplicated: false };
      }, database);
    } catch (error) {
      if (error instanceof OcppCallError) throw error;
      logError(`[OCPP] StartTransaction failed | chargePoint: ${safeLog(code)} | idTag: ${maskedTag}: ${sanitizeErrorMessage(error?.message || error)}`);
      throw new OcppCallError('InternalError', 'Database error during StartTransaction');
    }

    if (result.reviewReason || result.replaced) {
      logWarning(`[OCPP] StartTransaction requires review | chargePoint: ${safeLog(code)} | idTag: ${maskedTag} | reason: ${result.reviewReason || 'REPLACED_OPEN_SESSION'}`);
    }

    return {
      transactionId: result.transactionId,
      idTagInfo: { status: result.idTagStatus },
    };
  };
}

module.exports = { createStartTransactionHandler };