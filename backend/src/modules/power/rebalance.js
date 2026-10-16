'use strict';

const { withTransaction } = require('../../db/tx');
const { allocate } = require('./allocate');
const { buildChargingProfilePayload, commandFailure } = require('./profile-commands');
const { createPowerProfileOutcomeHandler } = require('./profile-outcomes');

function getDefaultPool() {
  return require('../../db/pool').pool;
}

function createPowerRebalancer({
  pool = null,
  commandSender,
  onProfileRejected = null,
  minIntervalMs = 2000,
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  const db = pool || getDefaultPool();
  const stationQueues = new Map();
  const profileOutcomes = onProfileRejected
    ? { onProfileRejected }
    : createPowerProfileOutcomeHandler({ db, commandSender });

  async function execute(stationId, reason) {
    const plan = await withTransaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`power-rebalance:${stationId}`]
      );
      const station = await client.query('SELECT power_limit_w FROM stations WHERE id = $1', [stationId]);
      if (!station.rowCount) throw new Error(`Station ${stationId} does not exist`);
      if (station.rows[0].power_limit_w === null) return { skipped: 'NO_POWER_LIMIT' };

      const active = await client.query(
        `SELECT cs.id::text AS session_id,
                cs.connector_id::text AS connector_id,
                c.connector_no,
                cp.id::text AS charge_point_id,
                cp.code AS charge_point_code,
                COALESCE(c.rated_power_w, ROUND(cp.power_kw * 1000)::integer)::integer AS rated_w
         FROM charging_sessions cs
         JOIN connectors c ON c.id = cs.connector_id
         JOIN charge_points cp ON cp.id = c.charge_point_id
         WHERE cp.station_id = $1
           AND cs.status = 'CHARGING'
           AND (c.ocpp_status IS NULL OR c.ocpp_status NOT IN ('SuspendedEV', 'Finishing', 'Unavailable', 'Faulted'))
         ORDER BY c.id`,
        [stationId]
      );
      const accepted = await client.query(
        `SELECT DISTINCT ON (session_id)
                session_id::text AS session_id, limit_w
         FROM charging_profile_log
         WHERE station_id = $1 AND status = 'ACCEPTED'
         ORDER BY session_id, id DESC`,
        [stationId]
      );
      return {
        limitW: station.rows[0].power_limit_w,
        sessions: active.rows,
        acceptedLimits: new Map((accepted.rows || []).map((row) => [String(row.session_id), row.limit_w])),
      };
    }, db);

    if (plan.skipped) return { stationId, skipped: plan.skipped, sessions: [] };
    if (!plan.sessions.length) return { stationId, sessions: [] };

    const allocations = allocate({
      limitW: plan.limitW,
      sessions: plan.sessions.map((session) => ({
        sessionId: session.session_id,
        ratedW: session.rated_w,
      })),
    });
    const allocationById = new Map(allocations.map((allocation) => [String(allocation.sessionId), allocation.limitW]));
    const results = [];

    for (const session of plan.sessions) {
      const limitW = allocationById.get(String(session.session_id));
      const acceptedLimitW = plan.acceptedLimits.get(String(session.session_id));
      if ((acceptedLimitW !== undefined && Number(acceptedLimitW) === limitW)
        || (acceptedLimitW === undefined && Number(session.rated_w) === limitW)) {
        results.push({ sessionId: session.session_id, limitW, status: 'UNCHANGED', reason: null });
        continue;
      }
      const transactionId = Number(session.session_id);
      if (!Number.isSafeInteger(transactionId) || transactionId < 0 || transactionId > 2147483647) {
        throw new RangeError(`Session ${session.session_id} cannot be represented as an OCPP transactionId`);
      }
      if (!commandSender) throw new Error('OCPP command sender is not configured');
      const log = await db.query(
        `INSERT INTO charging_profile_log (
           station_id, charge_point_id, connector_id, session_id, transaction_id, limit_w, status, attempt, trigger
         ) VALUES ($1, $2, $3, $4, $5, $6, 'SENT', 1, $7)
         RETURNING id`,
        [stationId, session.charge_point_id, session.connector_id, session.session_id, transactionId, limitW, reason || 'UNKNOWN']
      );
      const payload = buildChargingProfilePayload({
        connector_no: session.connector_no,
        transaction_id: transactionId,
        limit_w: limitW,
      });

      let status;
      let failureReason = null;
      try {
        const response = await commandSender.send(session.charge_point_code, 'SetChargingProfile', payload);
        if (response?.status === 'Accepted') status = 'ACCEPTED';
        else if (response?.status === 'Rejected') status = 'REJECTED';
        else if (response?.status === 'NotSupported') status = 'NOT_SUPPORTED';
        else throw new Error(`Invalid SetChargingProfile response: ${response?.status}`);
      } catch (error) {
        const failure = commandFailure(error);
        status = failure.status;
        failureReason = failure.reason;
      }

      await db.query(
        `UPDATE charging_profile_log
         SET status = $1, responded_at = CURRENT_TIMESTAMP, reason = $2
         WHERE id = $3`,
        [status, failureReason, log.rows[0].id]
      );
      if (status === 'REJECTED' || status === 'NOT_SUPPORTED') {
        await profileOutcomes.onProfileRejected(
          { ...session, station_id: stationId, limit_w: limitW },
          status,
          failureReason
        );
      }
      results.push({ sessionId: session.session_id, limitW, status, reason: failureReason });
    }

    return { stationId, sessions: results };
  }

  function settleQueue(key, queue) {
    if (queue.running || queue.timer !== null || queue.waiters.length > 0
      || queue.cleanupTimer !== null || queue.lastRunAt === null) return;
    const delay = Math.max(0, queue.lastRunAt + minIntervalMs - now());
    if (delay === 0) {
      if (stationQueues.get(key) === queue) stationQueues.delete(key);
      return;
    }
    queue.cleanupTimer = setTimeoutFn(() => {
      queue.cleanupTimer = null;
      settleQueue(key, queue);
    }, delay);
    queue.cleanupTimer?.unref?.();
  }

  function runPending(key, queue) {
    if (queue.running || queue.waiters.length === 0) return;
    queue.running = true;
    queue.rerunRequested = false;
    queue.lastRunAt = now();
    const reason = queue.reason;
    const waiters = queue.waiters.splice(0);

    execute(queue.stationId, reason).then(
      (result) => waiters.forEach(({ resolve }) => resolve(result)),
      (error) => waiters.forEach(({ reject }) => reject(error))
    ).finally(() => {
      queue.running = false;
      if (queue.rerunRequested && queue.waiters.length > 0 && queue.timer === null) {
        runPending(key, queue);
      } else {
        settleQueue(key, queue);
      }
    });
  }

  function scheduleTrailingRun(key, queue) {
    if (queue.timer !== null) clearTimeoutFn(queue.timer);
    queue.rerunRequested = false;
    queue.timer = setTimeoutFn(() => {
      queue.timer = null;
      if (queue.running) {
        queue.rerunRequested = true;
        return;
      }
      runPending(key, queue);
    }, minIntervalMs);
  }

  function rebalanceStation(stationId, { reason = 'UNKNOWN' } = {}) {
    const key = String(stationId);
    const queue = stationQueues.get(key) || {
      stationId,
      running: false,
      timer: null,
      cleanupTimer: null,
      rerunRequested: false,
      lastRunAt: null,
      reason,
      waiters: [],
    };
    stationQueues.set(key, queue);
    if (queue.cleanupTimer !== null) {
      clearTimeoutFn(queue.cleanupTimer);
      queue.cleanupTimer = null;
    }
    queue.reason = reason;

    const result = new Promise((resolve, reject) => queue.waiters.push({ resolve, reject }));
    if (queue.running || queue.timer !== null) {
      scheduleTrailingRun(key, queue);
    } else if (queue.lastRunAt === null || now() - queue.lastRunAt >= minIntervalMs) {
      runPending(key, queue);
    } else {
      scheduleTrailingRun(key, queue);
    }
    return result;
  }

  return { rebalanceStation };
}

module.exports = { createPowerRebalancer };
