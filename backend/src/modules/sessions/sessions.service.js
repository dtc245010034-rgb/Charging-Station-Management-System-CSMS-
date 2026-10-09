const { pool } = require('../../db/pool');
const { ForbiddenError, NotFoundError } = require('../../lib/errors');
const { calculateEnergyKwh } = require('./energy');
const repository = require('./sessions.repository');
const audit = require('../audit/audit.repository');
const env = require('../../config/env');
const { createRateLimiter } = require('../../lib/rate-limit');

const deniedLimiter = createRateLimiter({ limit: env.AUDIT_DENIED_LIMIT_PER_MINUTE, windowMs: 60000 });

function formatSessionDetails(row) {
  if (!row) return null;

  const currentWh = row.latest_energy_wh !== null && row.latest_energy_wh !== undefined
    ? Number(row.latest_energy_wh)
    : (row.meter_stop !== null && row.meter_stop !== undefined ? Number(row.meter_stop) : Number(row.meter_start));

  let energyKwh = null;
  if (row.meter_stop !== null && row.meter_stop !== undefined) {
    energyKwh = calculateEnergyKwh(row.meter_start, row.meter_stop);
  } else if (row.latest_energy_wh !== null && row.latest_energy_wh !== undefined) {
    energyKwh = calculateEnergyKwh(row.meter_start, row.latest_energy_wh);
  } else {
    energyKwh = 0;
  }

  const powerW = row.latest_power_w !== null && row.latest_power_w !== undefined
    ? Number(row.latest_power_w)
    : null;
  const currentA = row.latest_current_a !== null && row.latest_current_a !== undefined
    ? Number(row.latest_current_a)
    : null;

  return {
    id: row.id,
    station: {
      id: row.station_id,
      name: row.station_name,
      address: row.station_address,
    },
    charge_point: {
      id: row.charge_point_id,
      code: row.charge_point_code,
    },
    connector: {
      id: row.connector_id,
      connector_no: row.connector_no,
    },
    id_tag_masked: row.id_tag_masked,
    meter_start: Number(row.meter_start),
    meter_stop: row.meter_stop !== null && row.meter_stop !== undefined ? Number(row.meter_stop) : null,
    started_at: row.started_at,
    stopped_at: row.stopped_at,
    stop_reason: row.stop_reason,
    status: row.status,
    needs_review: row.needs_review,
    review_reason: row.review_reason,
    latest_reading: {
      energy_wh: currentWh,
      power_w: powerW,
      power_kw: powerW !== null ? powerW / 1000 : null,
      current_a: currentA,
      energy_kwh: energyKwh,
      sampled_at: row.last_metered_at,
    },
  };
}

async function getCurrentDriverSession(user, db = pool) {
  const row = await repository.findCurrentActiveSessionByDriverId(db, user.id);
  if (!row) return null;
  return formatSessionDetails(row);
}

async function getSessionById(sessionId, user, db = pool) {
  const row = await repository.findSessionById(db, sessionId);
  if (!row) {
    throw new NotFoundError('Phiên sạc không tồn tại');
  }

  const roles = user.roles || (user.role ? [user.role] : []);
  const isAdminOrOperator = roles.includes('ADMIN') || roles.includes('OPERATOR');

  // NĐ 13 / T-47: Tài xế chỉ xem được phiên của chính mình. Người khác truy cập -> 403 + ghi audit_logs.
  if (!isAdminOrOperator && String(row.driver_id) !== String(user.id)) {
    if (deniedLimiter.take(`actor:${user.id}`).allowed) {
      await audit.record(user.id, 'ACCESS_DENIED', 'charging_session', sessionId, {}, user.ip).catch(() => {});
    }
    throw new ForbiddenError('Không có quyền truy cập phiên sạc của tài xế khác');
  }

  return formatSessionDetails(row);
}

module.exports = {
  getCurrentDriverSession,
  getSessionById,
  formatSessionDetails,
};
