'use strict';

const { withTransaction } = require('../../db/tx');
const { pool } = require('../../db/pool');
const { AppError, NotFoundError } = require('../../lib/errors');
const { sanitizeErrorMessage } = require('../../lib/constants');
const stations = require('../stations/stations.service');
const audit = require('../audit/audit.repository');
const repository = require('./schedule.repository');
const { triggerPowerRebalance } = require('./rebalance-trigger');

function toMinute(time) {
  if (time === '24:00') return 1440;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function toTime(minute) {
  if (minute === 1440) return '24:00';
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function toResponse(window) {
  return {
    id: Number(window.id),
    startTime: toTime(window.start_minute),
    endTime: toTime(window.end_minute),
    limitKw: Number(window.limit_w) / 1000,
  };
}

async function recordAudit(actor, action, stationId, window, logError = console.error) {
  try {
    await audit.record(actor.id, action, 'station', stationId, {
      window_id: Number(window.id),
      start_time: toTime(window.start_minute),
      end_time: toTime(window.end_minute),
      limit_w: Number(window.limit_w),
    });
  } catch (error) {
    logError(`[Power schedule] Ghi audit ${action} thất bại:`, sanitizeErrorMessage(error?.message || error));
  }
}

async function list(actor, stationId, db = pool) {
  await stations.find(actor, stationId);
  return (await repository.list(db, stationId)).map(toResponse);
}

async function create(actor, stationId, input, { rebalanceStation = null, db = pool } = {}) {
  await stations.find(actor, stationId);
  const startMinute = toMinute(input.startTime);
  const endMinute = toMinute(input.endTime);
  let created;
  try {
    created = await withTransaction(async (client) => {
      const station = await client.query(
        'SELECT power_limit_w FROM stations WHERE id = $1 FOR UPDATE',
        [stationId]
      );
      if (!station.rows[0]) throw new NotFoundError('Không tìm thấy trạm');
      if (station.rows[0].power_limit_w === null) {
        throw new AppError(409, 'BASE_LIMIT_REQUIRED', 'Cần khai hạn mức nền trước khi thêm khung giờ');
      }
      return repository.insert(client, {
        stationId,
        startMinute,
        endMinute,
        limitW: input.limitKw,
        createdBy: actor.id,
      });
    }, db);
  } catch (error) {
    if (error.code === '23P01') {
      throw new AppError(409, 'POWER_WINDOW_OVERLAP', 'Khung giờ hạn mức bị chồng lấn');
    }
    throw error;
  }
  await recordAudit(actor, 'POWER_WINDOW_CREATED', stationId, created);
  triggerPowerRebalance(rebalanceStation, stationId, 'POWER_WINDOW_CREATED');
  return toResponse(created);
}

async function remove(actor, stationId, windowId, { rebalanceStation = null, db = pool } = {}) {
  await stations.find(actor, stationId);
  const window = await repository.findActive(db, stationId, windowId);
  if (!window) throw new NotFoundError('Không tìm thấy khung giờ hạn mức');
  const removed = await withTransaction((client) => repository.softDelete(client, {
    stationId,
    windowId,
    deletedBy: actor.id,
  }), db);
  if (!removed) throw new NotFoundError('Khung giờ hạn mức đã được xoá');
  await recordAudit(actor, 'POWER_WINDOW_DELETED', stationId, removed);
  triggerPowerRebalance(rebalanceStation, stationId, 'POWER_WINDOW_DELETED');
  return toResponse(removed);
}

module.exports = { list, create, remove, toResponse };
