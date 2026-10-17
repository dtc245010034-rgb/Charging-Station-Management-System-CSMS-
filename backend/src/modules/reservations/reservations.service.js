const { createHash } = require('node:crypto');
const { withTransaction } = require('../../db/tx');
const env = require('../../config/env');
const { getMinBalanceDong } = require('../wallet/min-balance.service');
const connections = require('../charge-points/connection-registry');
const audit = require('../audit/audit.repository');
const repo = require('./reservations.repository');
const { OcppCommandError } = require('../ocpp/commands');
const { OcppRemoteCallError } = require('../ocpp/message-handler');
const { sanitizeErrorMessage } = require('../../lib/constants');
const {
  AppError,
  BadRequestError,
  ConflictError,
  GatewayTimeoutError,
  NotFoundError,
  ServiceUnavailableError,
} = require('../../lib/errors');

const RESERVATION_CALL_TIMEOUT_MS = 10000;

function toResponse(row) {
  const startsAt = new Date(row.starts_at);
  const expiresAt = new Date(row.expires_at);
  const arriveInMinutes = Math.round((expiresAt.getTime() - startsAt.getTime()) / 60000) - env.RESERVATION_HOLD_MIN;
  return {
    id: Number(row.id),
    ocppReservationId: Number(row.ocpp_reservation_id),
    connectorId: Number(row.connector_id),
    status: row.status,
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    arriveInMinutes,
    rejectReason: row.reject_reason,
  };
}

async function listMine(driverId, db = repo.pool) {
  const rows = await repo.listForDriver(db, driverId);
  return rows.map((row) => ({
    ...toResponse(row),
    stationName: row.station_name,
    stationAddress: row.station_address,
    chargePointCode: row.charge_point_code,
    connectorNo: row.connector_no,
    connectorType: row.connector_type,
  }));
}

async function recordAudit(userId, action, row, metadata, ip, result) {
  try {
    await audit.record(userId, action, 'reservation', row.id, {
      reservation_id: Number(row.id),
      connector_id: Number(row.connector_id),
      ...metadata,
    }, ip, repo.pool, result);
  } catch (error) {
    console.error(`[Reservation] Ghi audit ${action} thất bại:`, sanitizeErrorMessage(error?.message || error));
  }
}

async function persistStatus(id, status, reason = null) {
  return repo.updateStatus(repo.pool, id, status, reason);
}

function mapRejectedStatus(status) {
  const errors = {
    Occupied: ['RESERVATION_OCCUPIED', 'Đầu nối đang được sử dụng. Hãy chọn đầu nối khác.'],
    Faulted: ['RESERVATION_FAULTED', 'Đầu nối đang báo lỗi và chưa thể đặt chỗ.'],
    Unavailable: ['RESERVATION_UNAVAILABLE', 'Đầu nối đang tạm ngừng phục vụ.'],
    Rejected: ['RESERVATION_REJECTED', 'Trụ sạc từ chối yêu cầu đặt chỗ.'],
  };
  return errors[status] || ['RESERVATION_REJECTED', 'Trụ sạc từ chối yêu cầu đặt chỗ.'];
}

async function create(driver, data, idempotencyKey, { commandSender, ip = null, db = repo.pool } = {}) {
  if (!commandSender) throw new ServiceUnavailableError('Chức năng điều khiển từ xa chưa được khởi tạo');
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new BadRequestError('Idempotency-Key không hợp lệ');
  }

  const now = new Date();
  const startsAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + (data.arriveInMinutes + env.RESERVATION_HOLD_MIN) * 60000).toISOString();
  const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');

  let created;
  let conflictContext = null;
  try {
    created = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`reservation:${driver.id}:${idempotencyKey}`]);
      const priorKey = await repo.findIdempotencyKey(client, driver.id, idempotencyKey);
      if (priorKey) {
        if (priorKey.request_hash !== requestHash) throw new ConflictError('Idempotency-Key đã được dùng cho yêu cầu khác');
        const reservationId = priorKey.response_body?.reservationId;
        const reservation = reservationId ? await repo.findById(client, reservationId) : null;
        if (!reservation) throw new ConflictError('Không thể phát lại yêu cầu đặt chỗ');
        return { reservation, replayed: true };
      }

      const wallet = await repo.findWalletForUpdate(client, driver.id);
      if (wallet?.locked || wallet?.locked_at) {
        throw new AppError(409, 'WALLET_LOCKED', 'Ví đang bị khóa để kiểm tra. Vui lòng liên hệ hỗ trợ.');
      }
      const minimumBalance = await getMinBalanceDong(client, undefined, now);
      const balance = BigInt(wallet?.balance_dong || '0');
      if (balance < minimumBalance) {
        const error = new AppError(409, 'WALLET_BELOW_MIN', 'Số dư ví chưa đủ để đặt chỗ. Vui lòng nạp thêm tiền.');
        error.details = { balanceDong: balance.toString(), minBalanceDong: minimumBalance.toString() };
        throw error;
      }

      const tag = await repo.findActiveTag(client, driver.id, now);
      if (!tag) throw new AppError(409, 'ID_TAG_UNAVAILABLE', 'Tài khoản chưa có thẻ sạc đang hoạt động.');

      const connector = await repo.findConnector(client, data.connectorId, { forUpdate: true });
      if (!connector) throw new NotFoundError('Không tìm thấy đầu nối');
      conflictContext = {
        stationId: connector.station_id,
        connectorId: connector.connector_id,
      };
      if (connector.station_status !== 'ACTIVE') {
        throw new AppError(409, 'STATION_NOT_ACTIVE', 'Trạm sạc hiện không hoạt động.');
      }
      if (connector.station_locked_at) {
        throw new AppError(409, 'STATION_UNAVAILABLE', 'Trạm sạc hiện không khả dụng.');
      }
      if (!connections.isConnected(connector.charge_point_code)) {
        throw new AppError(409, 'CHARGE_POINT_OFFLINE', 'Trụ sạc đang ngoại tuyến. Hãy thử lại khi trụ kết nối.');
      }
      if (connector.ocpp_status !== 'Available' || connector.connector_status !== 'AVAILABLE') {
        throw new AppError(409, 'CONNECTOR_UNAVAILABLE', 'Đầu nối không ở trạng thái sẵn sàng để đặt chỗ.');
      }
      if (await repo.findActiveForDriver(client, driver.id, now)) {
        throw new AppError(409, 'RESERVATION_ALREADY_ACTIVE', 'Bạn đang có một chỗ đặt còn hiệu lực.');
      }

      const reservation = await repo.insertPending(client, {
        driverId: driver.id,
        connectorId: connector.connector_id,
        idTagId: tag.id,
        startsAt,
        expiresAt,
      });
      await repo.insertIdempotencyKey(client, driver.id, idempotencyKey, requestHash, reservation.id);
      return { reservation, connector, tag, replayed: false };
    }, db);
  } catch (error) {
    if (error.code === '23P01') {
      const conflict = new AppError(409, 'CONNECTOR_RESERVED', 'Đầu nối đã được đặt chỗ. Hãy chọn đầu nối khác.');
      let suggestions = [];
      try {
        const candidates = await repo.findAvailableSuggestions(
          repo.pool,
          conflictContext.stationId,
          conflictContext.connectorId,
          startsAt,
          expiresAt
        );
        suggestions = candidates
          .filter((candidate) => connections.isConnected(candidate.charge_point_code))
          .slice(0, 5)
          .map((candidate) => ({
            connectorId: String(candidate.connector_id),
            connectorNo: candidate.connector_no,
            chargePointCode: candidate.charge_point_code,
            connectorType: candidate.connector_type,
          }));
      } catch (suggestionError) {
        console.warn('[Reservation] Không lấy được gợi ý đầu nối:', sanitizeErrorMessage(suggestionError?.message || suggestionError));
      }
      conflict.details = { suggestions };
      throw conflict;
    }
    if (error.code === '23505' && error.constraint === 'reservations_one_active_per_driver') {
      throw new AppError(409, 'RESERVATION_ALREADY_ACTIVE', 'Bạn đang có một chỗ đặt còn hiệu lực.');
    }
    throw error;
  }

  if (created.replayed) {
    if (created.reservation.status === 'REJECTED') {
      const [code, message] = mapRejectedStatus(created.reservation.reject_reason);
      throw new AppError(409, code, message);
    }
    if (created.reservation.status === 'FAILED') {
      throw new AppError(409, 'RESERVATION_FAILED', 'Không thể hoàn tất lệnh đặt chỗ trước đó.');
    }
    return toResponse(created.reservation);
  }

  await recordAudit(driver.id, 'RESERVATION_CREATED', created.reservation, {}, ip, 'PENDING');

  const payload = {
    connectorId: created.connector.connector_no,
    expiryDate: expiresAt,
    idTag: created.tag.tag,
    reservationId: Number(created.reservation.ocpp_reservation_id),
  };
  let result;
  try {
    result = await commandSender.send(created.connector.charge_point_code, 'ReserveNow', payload, {
      timeoutMs: RESERVATION_CALL_TIMEOUT_MS,
    });
  } catch (error) {
    await persistStatus(created.reservation.id, 'FAILED', error.code || error.name || 'OCPP_ERROR');
    if (error instanceof OcppCommandError && error.code === 'OFFLINE') {
      throw new AppError(409, 'CHARGE_POINT_OFFLINE', 'Trụ sạc đã mất kết nối trước khi xác nhận đặt chỗ.');
    }
    if (/^OCPP call timed out:/.test(error?.message || '')) throw new GatewayTimeoutError();
    if (error instanceof OcppRemoteCallError || error?.name === 'OcppRemoteCallError') {
      throw new AppError(409, 'RESERVATION_FAILED', 'Trụ sạc không thể xử lý yêu cầu đặt chỗ.');
    }
    throw error;
  }

  if (result?.status === 'Accepted') {
    const accepted = await persistStatus(created.reservation.id, 'ACCEPTED');
    return toResponse(accepted);
  }
  if (['Occupied', 'Faulted', 'Unavailable', 'Rejected'].includes(result?.status)) {
    await persistStatus(created.reservation.id, 'REJECTED', result.status);
    await recordAudit(driver.id, 'RESERVATION_REJECTED', created.reservation, { reason: result.status }, ip, 'REJECTED');
    const [code, message] = mapRejectedStatus(result.status);
    throw new AppError(409, code, message);
  }

  await persistStatus(created.reservation.id, 'FAILED', 'INVALID_OCPP_RESPONSE');
  throw new ServiceUnavailableError('Trụ sạc trả phản hồi ReserveNow không hợp lệ');
}

module.exports = { RESERVATION_CALL_TIMEOUT_MS, create, listMine, toResponse };