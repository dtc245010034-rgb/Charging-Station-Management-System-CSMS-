'use strict';

const { sanitizeErrorMessage } = require('../../lib/constants');

const POWER_SCHEDULE_TICK_MS = 15000;

function getDb(db) {
  return db || require('../../db/pool').pool;
}

/**
 * Quét các trạm có ít nhất 1 khung giờ đang hoạt động và ít nhất 1 phiên đang sạc (CHARGING),
 * sau đó kích hoạt rebalanceStation(stationId, { reason: 'SCHEDULE' }).
 *
 * @param {Object} options
 * @param {Function} options.rebalanceStation - Hàm rebalanceStation(stationId, { reason })
 * @param {Object} [options.db] - Database pool / client
 * @returns {Promise<Array<number|string>>} Danh sách stationId đã được rebalance
 */
async function tickPowerSchedule({ rebalanceStation, db = null } = {}) {
  if (typeof rebalanceStation !== 'function') return [];
  const database = getDb(db);

  const query = `
    SELECT DISTINCT s.id
    FROM stations s
    JOIN station_power_windows spw ON spw.station_id = s.id AND spw.deleted_at IS NULL
    JOIN charge_points cp ON cp.station_id = s.id
    JOIN connectors c ON c.charge_point_id = cp.id
    JOIN charging_sessions cs ON cs.connector_id = c.id AND cs.status = 'CHARGING'
  `;

  const { rows } = await database.query(query);
  const rebalanced = [];

  for (const row of rows) {
    try {
      await rebalanceStation(row.id, { reason: 'SCHEDULE' });
      rebalanced.push(row.id);
    } catch {
      // K4: không ngắt vòng lặp khi một trạm lỗi
    }
  }

  return rebalanced;
}

/**
 * Khởi động job định kỳ chạy tickPowerSchedule.
 *
 * @param {Object} options
 * @param {Function} options.rebalanceStation
 * @param {number} [options.intervalMs]
 * @param {Object} [options.db]
 * @param {Function} [options.logError]
 * @returns {{ stop: Function, tick: Function }}
 */
function startPowerScheduleJob({
  rebalanceStation,
  intervalMs = POWER_SCHEDULE_TICK_MS,
  db = null,
  logError = console.error,
} = {}) {
  let running = null;

  async function tick() {
    if (running) return running;
    running = (async () => {
      try {
        return await tickPowerSchedule({ rebalanceStation, db });
      } catch (error) {
        logError(`[Power schedule job] Lỗi: ${sanitizeErrorMessage(error?.message || error)}`);
        return [];
      }
    })().finally(() => {
      running = null;
    });
    return running;
  }

  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();

  return {
    stop: () => clearInterval(timer),
    tick,
  };
}

module.exports = {
  POWER_SCHEDULE_TICK_MS,
  tickPowerSchedule,
  startPowerScheduleJob,
};
