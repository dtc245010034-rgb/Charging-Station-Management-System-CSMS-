'use strict';

const { pool } = require('../../db/pool');
const { sanitizeErrorMessage } = require('../../lib/constants');

const POWER_SCHEDULE_TICK_MS = 15000;

function createPowerScheduleJob({
  db = pool,
  rebalanceStation,
  logError = console.error,
} = {}) {
  if (typeof rebalanceStation !== 'function') throw new TypeError('rebalanceStation is required');

  async function run() {
    const stations = await db.query(
      `SELECT DISTINCT s.id
       FROM stations s
       JOIN station_power_windows w ON w.station_id = s.id AND w.deleted_at IS NULL
       WHERE EXISTS (
         SELECT 1 FROM charging_sessions cs
         JOIN connectors c ON c.id = cs.connector_id
         JOIN charge_points cp ON cp.id = c.charge_point_id
         WHERE cp.station_id = s.id AND cs.status = 'CHARGING'
       )
       ORDER BY s.id`
    );
    const results = [];
    for (const { id } of stations.rows) {
      try {
        results.push(await rebalanceStation(id, { reason: 'SCHEDULE' }));
      } catch (error) {
        logError(
          `[Power schedule] Rebalance station ${id} failed:`,
          sanitizeErrorMessage(error?.message || error)
        );
      }
    }
    return results;
  }

  return { run };
}

function startPowerScheduleJob({
  intervalMs = POWER_SCHEDULE_TICK_MS,
  logError = console.error,
  ...options
} = {}) {
  const job = createPowerScheduleJob({ ...options, logError });
  let running = null;
  async function tick() {
    if (running) return running;
    running = job.run().catch((error) => {
      logError(`[Power schedule] Scan failed: ${sanitizeErrorMessage(error?.message || error)}`);
      return null;
    }).finally(() => { running = null; });
    return running;
  }
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();
  void tick();
  return { run: tick, stop: () => clearInterval(timer) };
}

module.exports = { POWER_SCHEDULE_TICK_MS, createPowerScheduleJob, startPowerScheduleJob };
