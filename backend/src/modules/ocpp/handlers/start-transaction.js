const { safeLog, sanitizeErrorMessage } = require('../../../lib/constants');
const { OcppCallError } = require('../frames');
const { withTransaction } = require('../../../db/tx');
const { evaluateIdTag, maskIdTag, MAX_ID_TAG_LENGTH } = require('./authorize');
const {
  findConnectorWithStation,
  findTagByTagValue,
  closeActiveSessionAsAbnormal,
  startSession,
  recordOrphanMessage,
  findNaturalSession,
  lockConnectorRow,
  markRemoteStartRequestStarted,
} = require('../../sessions/sessions.repository');
const { publishSessionUpdateFromDb } = require('../../sessions/sessions.events');

const MAX_CLOCK_SKEW_MS = 24 * 3600 * 1000;

function getDefaultPool() {
  return require('../../../db/pool').ocppPool;
}

function validateStartTransactionPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new OcppCallError('FormationViolation', 'Payload must be an object');
  }

  const { connectorId, idTag, meterStart, timestamp } = payload;

  if (!Number.isInteger(connectorId) || connectorId < 1) {
    throw new OcppCallError('PropertyConstraintViolation', 'connectorId must be an integer >= 1');
  }

  if (typeof idTag !== 'string' || idTag.trim() === '') {
    throw new OcppCallError('FormationViolation', 'idTag must be a non-empty string');
  }

  if (idTag.length > MAX_ID_TAG_LENGTH) {
    throw new OcppCallError('FormationViolation', `idTag exceeds maximum length of ${MAX_ID_TAG_LENGTH} characters`);
  }

  if (typeof meterStart !== 'number' || !Number.isSafeInteger(meterStart) || meterStart < 0) {
    throw new OcppCallError('FormationViolation', 'meterStart must be a valid non-negative safe integer');
  }

  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    throw new OcppCallError('PropertyConstraintViolation', 'timestamp must be a valid ISO 8601 string');
  }
}

function createStartTransactionHandler({
  pool = null,
  now = () => new Date(),
  logInfo = console.info,
  logWarning = console.warn,
  logError = console.error,
} = {}) {
  const getPool = () => pool || getDefaultPool();

  return async function handleStartTransaction(payload, { connection } = {}) {
    validateStartTransactionPayload(payload);

    const rawTag = payload.idTag.trim();
    const masked = maskIdTag(rawTag);
    const code = connection?.chargePointCode || connection?.chargePoint?.code;
    const db = getPool();

    // 1. Phân giải chargePointId
    let chargePointId = connection?.chargePoint?.id;
    if (!chargePointId && code) {
      const cpResult = await db.query(
        'SELECT id, code, station_id FROM charge_points WHERE UPPER(code) = UPPER($1) LIMIT 1',
        [code]
      );
      if (cpResult.rows[0]) {
        chargePointId = cpResult.rows[0].id;
      }
    }

    if (!chargePointId) {
      logError(`[OCPP] StartTransaction: Không xác định được charge_point_id | code: ${safeLog(code)}`);
      throw new OcppCallError('InternalError', 'Charge point not identified');
    }

    // 2. Tra cứu đầu nối và trạng thái trạm
    const connectorInfo = await findConnectorWithStation(db, {
      chargePointId,
      connectorNo: payload.connectorId,
    });

    // Q2: connectorId chưa khai báo -> ghi orphan_messages, trả CALLERROR PropertyConstraintViolation
    if (!connectorInfo) {
      logWarning(`[OCPP] StartTransaction: connectorId ${payload.connectorId} chưa khai báo trên trụ ${safeLog(code)}`);
      try {
        await recordOrphanMessage(db, {
          chargePointId,
          action: 'StartTransaction',
          payload,
          reason: `Undeclared connectorId: ${payload.connectorId}`,
        });
      } catch (orphanError) {
        logError('[OCPP] StartTransaction: Lỗi ghi orphan_messages:', sanitizeErrorMessage(orphanError?.message || orphanError));
      }
      throw new OcppCallError('PropertyConstraintViolation', `Connector ${payload.connectorId} is undeclared`);
    }

    // 3. Xử lý thời gian và độ lệch đồng hồ (D6)
    const currentTime = now();
    const currentMs = currentTime instanceof Date ? currentTime.getTime() : new Date(currentTime).getTime();
    const reportedMs = Date.parse(payload.timestamp);
    const isClockSkewed = Math.abs(reportedMs - currentMs) > MAX_CLOCK_SKEW_MS;

    let needsReview = false;
    const reviewReasons = [];

    // Chống trùng tự nhiên (D4) theo mốc nguyên văn của tin
    const startedAt = new Date(reportedMs).toISOString();
    if (isClockSkewed) {
      needsReview = true;
      reviewReasons.push('Timestamp skewed by more than 24 hours');
      logWarning(`[OCPP] StartTransaction: Đồng hồ trụ ${safeLog(code)} lệch quá 24h (báo ${payload.timestamp}, hiện tại ${new Date(currentMs).toISOString()})`);
    }

    // 4. Tra cứu thẻ và đánh giá trạng thái bằng evaluateIdTag (S-15)
    let tagRecord = null;
    try {
      tagRecord = await findTagByTagValue(db, rawTag);
    } catch (tagError) {
      logError(`[OCPP] StartTransaction: Lỗi tra cứu thẻ ${masked}:`, sanitizeErrorMessage(tagError?.message || tagError));
      throw new OcppCallError('InternalError', 'Database error during tag lookup');
    }

    const station = {
      status: connectorInfo.station_status,
      locked_at: connectorInfo.station_locked_at,
    };
    const tagStatus = evaluateIdTag({ tagRecord, station, now: currentTime });

    // AC2: Thẻ khoá/không tồn tại -> vẫn cấp transactionId nhưng idTagInfo là Blocked/Invalid/Expired, phiên needs_review
    if (tagStatus !== 'Accepted') {
      needsReview = true;
      reviewReasons.push(`Tag status: ${tagStatus}`);
      logWarning(`[OCPP] StartTransaction: Thẻ không được chấp nhận | code: ${safeLog(code)} | idTag: ${masked} -> ${tagStatus}`);
    }

    // 5. Thực thi trong một giao dịch duy nhất trên ocppPool
    try {
      const { session, closed } = await withTransaction(async (client) => {
        // 1. Khoá hàng connector để tuần tự hoá các yêu cầu đồng thời trên cùng một đầu nối
        await lockConnectorRow(client, connectorInfo.connector_id);

        // 2. Kiểm tra D4: nếu phiên đã tồn tại tự nhiên từ trước (tin gửi lại ngoài cửa sổ S-14)
        const existingNaturalSession = await findNaturalSession(client, {
          chargePointId: connectorInfo.charge_point_id,
          connectorNo: connectorInfo.connector_no,
          idTagMasked: masked,
          meterStart: payload.meterStart,
          startedAt,
        });

        if (existingNaturalSession) {
          if (tagRecord) {
            await markRemoteStartRequestStarted(client, {
              connectorId: connectorInfo.connector_id,
              idTagId: tagRecord.id,
              sessionId: existingNaturalSession.id,
            });
          }
          logInfo(
            `[OCPP] StartTransaction: Phát hiện tin gửi lại tự nhiên (D4) | transactionId: ${existingNaturalSession.id}`
          );
          return { session: existingNaturalSession, closed: [] };
        }

        // 3. AC3: Đầu nối còn phiên CHARGING khác -> đóng phiên cũ thành ABNORMAL (kWh để trống), cảnh báo
        const closedOldSessions = await closeActiveSessionAsAbnormal(client, {
          connectorId: connectorInfo.connector_id,
          reason: 'Replaced by new transaction',
        });

        if (closedOldSessions && closedOldSessions.length > 0) {
          logWarning(
            `[OCPP] StartTransaction: Đầu nối ${connectorInfo.connector_id} còn phiên cũ CHARGING (${closedOldSessions.map((s) => s.id).join(', ')}). Đã chuyển sang ABNORMAL.`
          );
        }

        // 4. Tạo phiên mới
        const newSession = await startSession(client, {
          chargePointId: connectorInfo.charge_point_id,
          connectorId: connectorInfo.connector_id,
          connectorNo: connectorInfo.connector_no,
          idTagId: tagRecord ? tagRecord.id : null,
          idTagMasked: masked,
          driverId: tagRecord ? tagRecord.user_id : null,
          meterStart: payload.meterStart,
          startedAt,
          status: 'CHARGING',
          needsReview,
          reviewReason: reviewReasons.length > 0 ? reviewReasons.join('; ') : null,
        });
        if (tagRecord) {
          await markRemoteStartRequestStarted(client, {
            connectorId: connectorInfo.connector_id,
            idTagId: tagRecord.id,
            sessionId: newSession.id,
          });
        }
        return { session: newSession, closed: closedOldSessions || [] };
      }, db);

      for (const old of closed) {
        publishSessionUpdateFromDb(old.id, { pool: db, driverId: old.driver_id }).catch(() => {});
      }
      if (session?.id) {
        publishSessionUpdateFromDb(session.id, {
          pool: db,
          driverId: tagRecord ? tagRecord.user_id : null,
        }).catch(() => {});
      }

      logInfo(
        `[OCPP] StartTransaction thành công | transactionId: ${session.id} | code: ${safeLog(code)} | idTag: ${masked} | status: ${tagStatus}`
      );

      return {
        transactionId: session.id,
        idTagInfo: {
          status: tagStatus,
        },
      };
    } catch (txError) {
      logError(
        `[OCPP] StartTransaction: Lỗi giao dịch DB | code: ${safeLog(code)} | idTag: ${masked}:`,
        sanitizeErrorMessage(txError?.message || txError)
      );
      throw new OcppCallError('InternalError', 'Database error during transaction start');
    }
  };
}

module.exports = {
  createStartTransactionHandler,
  validateStartTransactionPayload,
};
