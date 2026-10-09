const { calculateEnergyKwh } = require('./energy');
const {
  findActiveSessionByDriverId,
  findSessionById,
  existsSessionById,
} = require('./sessions.repository');
const { NotFoundError } = require('../../lib/errors');

function getDefaultDenyOrNotFound() {
  return require('../../lib/ownership').denyOrNotFound;
}

function formatSession(row) {
  if (!row) return null;

  const meterStart = row.meter_start !== null && row.meter_start !== undefined
    ? Number(row.meter_start)
    : null;
  const meterStop = row.meter_stop !== null && row.meter_stop !== undefined
    ? Number(row.meter_stop)
    : null;
  const latestEnergyWh = row.latest_energy_wh !== null && row.latest_energy_wh !== undefined
    ? Number(row.latest_energy_wh)
    : null;

  let currentKwh = null;
  if (row.status === 'COMPLETED' && meterStop !== null) {
    currentKwh = calculateEnergyKwh(meterStart, meterStop);
  } else if (meterStart !== null) {
    const currentEndWh = latestEnergyWh !== null ? latestEnergyWh : meterStart;
    currentKwh = calculateEnergyKwh(meterStart, currentEndWh);
  }

  return {
    id: row.id,
    transaction_id: row.id,
    charge_point_id: Number(row.charge_point_id),
    charge_point_code: row.charge_point_code,
    station_id: Number(row.station_id),
    station_name: row.station_name,
    station_address: row.station_address,
    connector_id: Number(row.connector_id),
    connector_no: row.connector_no,
    driver_id: row.driver_id ? Number(row.driver_id) : null,
    id_tag_masked: row.id_tag_masked,
    meter_start: meterStart,
    meter_stop: meterStop,
    current_kwh: currentKwh,
    started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
    stopped_at: row.stopped_at ? new Date(row.stopped_at).toISOString() : null,
    stop_reason: row.stop_reason || null,
    status: row.status,
    needs_review: Boolean(row.needs_review),
    review_reason: row.review_reason || null,
    latest_power_w: row.latest_power_w !== null && row.latest_power_w !== undefined ? Number(row.latest_power_w) : null,
    latest_current_a: row.latest_current_a !== null && row.latest_current_a !== undefined ? Number(row.latest_current_a) : null,
    latest_soc: row.latest_soc !== null && row.latest_soc !== undefined ? Number(row.latest_soc) : null,
    latest_sampled_at: row.latest_sampled_at ? new Date(row.latest_sampled_at).toISOString() : null,
    latest_readings: Array.isArray(row.latest_readings) ? row.latest_readings : [],
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function getCurrentSessionForDriver(user, options = {}) {
  if (!user || !user.id) return null;
  const db = options?.query ? options : options?.db || null;
  const row = await findActiveSessionByDriverId(db, user.id);
  if (!row) return null;
  return formatSession(row);
}

async function getSessionById(user, sessionId, options = {}) {
  const db = options?.query ? options : options?.db || null;
  const row = await findSessionById(db, sessionId);

  if (!row) {
    const exists = await existsSessionById(db, sessionId);
    if (!exists) {
      throw new NotFoundError('Không tìm thấy phiên sạc');
    }
    const onDeny = options?.onDeny || getDefaultDenyOrNotFound();
    await onDeny(user, 'charging_sessions', sessionId, async () => true, 'Không tìm thấy phiên sạc');
  }

  const roles = user.roles || [user.role];
  const hasElevatedAccess = roles.includes('ADMIN') || roles.includes('OPERATOR') || roles.includes('ACCOUNTANT');

  if (hasElevatedAccess) {
    return formatSession(row);
  }

  const getDeny = () => options?.onDeny || getDefaultDenyOrNotFound();

  if (roles.includes('STATION_OWNER')) {
    if (String(row.station_owner_id) !== String(user.id)) {
      await getDeny()(user, 'charging_sessions', sessionId, async () => true, 'Không tìm thấy phiên sạc');
    }
    return formatSession(row);
  }

  // DRIVER hoặc vai trò khác: chỉ đọc phiên của chính mình (NĐ 13 / IDOR)
  if (!row.driver_id || String(row.driver_id) !== String(user.id)) {
    await getDeny()(user, 'charging_sessions', sessionId, async () => true, 'Không tìm thấy phiên sạc');
  }

  return formatSession(row);
}

module.exports = {
  getCurrentSessionForDriver,
  getSessionById,
  formatSession,
};
