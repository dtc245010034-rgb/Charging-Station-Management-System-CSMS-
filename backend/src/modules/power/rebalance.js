'use strict';

const { withTransaction } = require('../../db/tx');
const { allocate } = require('./allocate');
const { buildChargingProfilePayload, commandFailure } = require('./profile-commands');
const { createPowerProfileOutcomeHandler } = require('./profile-outcomes');

function getDefaultPool() {
  return require('../../db/pool').pool;
}

function createPowerRebalancer({ pool = null, commandSender, onProfileRejected = null } = {}) {
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
      return {
        limitW: station.rows[0].power_limit_w,
        sessions: active.rows,
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

  function rebalanceStation(stationId, { reason = 'UNKNOWN' } = {}) {
    const key = String(stationId);
    const next = (stationQueues.get(key) || Promise.resolve()).then(
      () => execute(stationId, reason),
      () => execute(stationId, reason)
    );
    stationQueues.set(key, next);
    const release = () => {
      if (stationQueues.get(key) === next) stationQueues.delete(key);
    };
    next.then(release, release);
    return next;
  }

  return { rebalanceStation };
}

module.exports = { createPowerRebalancer };
