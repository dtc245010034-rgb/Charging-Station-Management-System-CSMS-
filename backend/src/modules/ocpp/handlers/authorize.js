const { safeLog, sanitizeErrorMessage } = require('../../../lib/constants');
const { OcppCallError } = require('../frames');

const MAX_ID_TAG_LENGTH = 20;

function maskIdTag(tag) {
  if (typeof tag !== 'string') return '****';
  if (tag.length <= 4) return tag;
  return '*'.repeat(tag.length - 4) + tag.slice(-4);
}

/**
 * Hàm thuần thẩm định trạng thái thẻ theo quy tắc S-15 / OCPP 1.6
 * Dùng lại cho StartTransaction ở Sprint 3 (S-17)
 *
 * @param {object} params
 * @param {object|null} params.tag - Bản ghi thẻ từ bảng id_tags (hoặc tagRecord)
 * @param {object|null} params.station - Bản ghi trạm sạc ({ status, locked_at })
 * @param {Date|string|number} [params.now] - Thời điểm kiểm tra (mặc định hiện tại)
 * @returns {'Accepted' | 'Blocked' | 'Expired' | 'Invalid'}
 */
function evaluateIdTag({ tag, tagRecord, station, now = new Date() } = {}) {
  const record = tagRecord !== undefined ? tagRecord : tag;
  if (!record || typeof record !== 'object') return 'Invalid';
  if (record.status === 'BLOCKED') return 'Blocked';

  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (record.expires_at && new Date(record.expires_at).getTime() < currentTime) return 'Expired';

  const isLocked = Boolean(station?.locked_at || station?.isLocked);
  if (isLocked) return 'Blocked';
  if (station?.status && station.status !== 'ACTIVE') return 'Blocked';

  return 'Accepted';
}

function getDefaultPool() {
  return require('../../../db/pool').ocppPool;
}

function createAuthorizeHandler({
  pool = null,
  now = () => new Date(),
  logInfo = console.info,
  logWarning = console.warn,
  logError = console.error,
} = {}) {
  return async function handleAuthorize(payload, { connection } = {}) {
    const rawTag = payload?.idTag;

    // OCPP 1.6 CiString20Type: từ chối nếu dài hơn 20 ký tự
    if (typeof rawTag === 'string' && rawTag.length > MAX_ID_TAG_LENGTH) {
      logWarning(`[OCPP] Authorize bị từ chối: idTag vượt quá ${MAX_ID_TAG_LENGTH} ký tự`);
      throw new OcppCallError(
        'FormationViolation',
        `idTag exceeds maximum length of ${MAX_ID_TAG_LENGTH} characters`
      );
    }

    if (!rawTag || typeof rawTag !== 'string' || rawTag.trim() === '') {
      logWarning('[OCPP] Authorize bị từ chối: thiếu hoặc rỗng idTag');
      return { idTagInfo: { status: 'Invalid' } };
    }

    const idTag = rawTag.trim();
    const masked = maskIdTag(idTag);
    const code = connection?.chargePointCode || connection?.chargePoint?.code;

    const db = pool || getDefaultPool();
    let tagRecord = null;
    let station = null;

    try {
      if (db) {
        const tagResult = await db.query(
          'SELECT id, tag, status, expires_at, user_id FROM id_tags WHERE UPPER(tag) = UPPER($1) LIMIT 1',
          [idTag]
        );
        tagRecord = tagResult.rows[0] || null;

        if (code) {
          const stationResult = await db.query(
            `SELECT s.id, s.status, s.locked_at
             FROM stations s
             JOIN charge_points cp ON cp.station_id = s.id
             WHERE UPPER(cp.code) = UPPER($1) LIMIT 1`,
            [code]
          );
          station = stationResult.rows[0] || null;
        }
      }
    } catch (error) {
      logError(`[OCPP] Authorize DB query failed | code: ${safeLog(code)} | idTag: ${masked}:`, sanitizeErrorMessage(error?.message || error));
      throw new OcppCallError('InternalError', 'Database error during authorization');
    }

    if (!station && connection?.chargePoint) {
      station = {
        status: connection.chargePoint.station_status,
        locked_at: connection.isStationLocked ? new Date() : null,
      };
    }
    if (connection?.isStationLocked && station) {
      station.locked_at = station.locked_at || new Date();
    }

    const status = evaluateIdTag({ tagRecord, station, now: now() });

    if (status === 'Invalid') {
      logWarning(`[OCPP] Authorize: Thẻ không tồn tại hoặc không hợp lệ | code: ${safeLog(code)} | idTag: ${masked} -> Invalid`);
    } else {
      logInfo(`[OCPP] Authorize | code: ${safeLog(code)} | idTag: ${masked} -> ${status}`);
    }

    return { idTagInfo: { status } };
  };
}

module.exports = { createAuthorizeHandler, evaluateIdTag, maskIdTag, MAX_ID_TAG_LENGTH };
