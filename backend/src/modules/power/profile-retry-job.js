'use strict';

const { withTransaction } = require('../../db/tx');
const { sanitizeErrorMessage } = require('../../lib/constants');
const { commandFailure, buildChargingProfilePayload } = require('./profile-commands');
const { createPowerProfileOutcomeHandler } = require('./profile-outcomes');

const PROFILE_RETRY_DELAYS_SECONDS = Object.freeze([30, 60, 120]);
const PROFILE_RETRY_LIMIT = PROFILE_RETRY_DELAYS_SECONDS.length;
const PROFILE_RETRY_INTERVAL_MS = 5000;
const PROFILE_RETRY_BATCH_SIZE = 50;

function getDefaultPool() {
  return require('../../db/pool').pool;
}

function createPowerProfileRetryJob({
  db = null,
  commandSender,
  onProfileRejected = null,
  onProfileUnconfirmed = null,
  commandTimeoutSeconds = 30,
  batchSize = PROFILE_RETRY_BATCH_SIZE,
  logInfo = console.info,
} = {}) {
  const database = db || getDefaultPool();
  const outcomes = onProfileRejected && onProfileUnconfirmed
    ? { onProfileRejected, onProfileUnconfirmed }
    : createPowerProfileOutcomeHandler({ db: database, commandSender });
  const rejectProfile = onProfileRejected || outcomes.onProfileRejected;
  const alertUnconfirmed = onProfileUnconfirmed || outcomes.onProfileUnconfirmed;

  async function expireUnansweredProfiles() {
    await database.query(
      `UPDATE charging_profile_log l
       SET status = 'TIMEOUT',
           responded_at = CURRENT_TIMESTAMP,
           reason = COALESCE(l.reason, 'No response was recorded before the command timeout')
       WHERE l.status = 'SENT'
         AND l.requested_at <= CURRENT_TIMESTAMP - make_interval(secs => $1::int)
         AND NOT EXISTS (
           SELECT 1 FROM charging_profile_log newer
           WHERE newer.session_id = l.session_id AND newer.id > l.id
         )`,
      [commandTimeoutSeconds]
    );
  }

  async function loadDueProfiles() {
    const result = await database.query(
      `SELECT DISTINCT ON (l.session_id)
              l.id, l.attempt, l.status, l.station_id::text, l.charge_point_id::text,
              l.connector_id::text, l.session_id::text, l.transaction_id, l.limit_w,
              l.trigger, cp.code AS charge_point_code, c.connector_no, cs.status AS session_status
       FROM charging_profile_log l
       JOIN charging_sessions cs ON cs.id = l.session_id
       JOIN charge_points cp ON cp.id = l.charge_point_id
       JOIN connectors c ON c.id = l.connector_id
       WHERE cs.status = 'CHARGING'
         AND l.status IN ('OFFLINE', 'TIMEOUT')
         AND l.attempt <= $2
         AND l.requested_at <= CURRENT_TIMESTAMP
             - make_interval(secs => CASE l.attempt
                 WHEN 1 THEN $3::int WHEN 2 THEN $4::int WHEN 3 THEN $5::int END)
         AND NOT EXISTS (
           SELECT 1 FROM charging_profile_log newer
           WHERE newer.session_id = l.session_id AND newer.id > l.id
         )
       ORDER BY l.session_id, l.id DESC
       LIMIT $1`,
      [batchSize, PROFILE_RETRY_LIMIT, ...PROFILE_RETRY_DELAYS_SECONDS]
    );
    return result.rows || [];
  }

  async function claimProfile(profile) {
    return withTransaction(async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`power-profile-retry:${profile.session_id}`]
      );
      const latest = await client.query(
        `SELECT l.id, l.attempt, l.status, l.station_id, l.charge_point_id, l.connector_id,
                l.session_id, l.transaction_id, l.limit_w, l.trigger, cp.code AS charge_point_code,
                c.connector_no, cs.status AS session_status
         FROM charging_profile_log l
         JOIN charging_sessions cs ON cs.id = l.session_id
         JOIN charge_points cp ON cp.id = l.charge_point_id
         JOIN connectors c ON c.id = l.connector_id
         WHERE l.session_id = $1
           AND l.id = (SELECT MAX(latest.id) FROM charging_profile_log latest WHERE latest.session_id = l.session_id)
           AND cs.status = 'CHARGING'
           AND l.status IN ('OFFLINE', 'TIMEOUT')
           AND l.attempt <= $2
           AND l.requested_at <= CURRENT_TIMESTAMP
               - make_interval(secs => CASE l.attempt
                   WHEN 1 THEN $3::int WHEN 2 THEN $4::int WHEN 3 THEN $5::int END)
         FOR UPDATE OF l`,
        [profile.session_id, PROFILE_RETRY_LIMIT, ...PROFILE_RETRY_DELAYS_SECONDS]
      );
      const current = latest.rows?.[0];
      if (!current || String(current.id) !== String(profile.id)) return null;
      const inserted = await client.query(
        `INSERT INTO charging_profile_log (
           station_id, charge_point_id, connector_id, session_id, transaction_id, limit_w,
           status, attempt, trigger
         ) SELECT station_id, charge_point_id, connector_id, session_id, transaction_id, limit_w,
                  'SENT', attempt + 1, trigger
           FROM charging_profile_log WHERE id = $1
         RETURNING id`,
        [current.id]
      );
      return { ...current, id: inserted.rows[0].id, attempt: current.attempt + 1 };
    }, database);
  }

  async function recordResult(profile, status, reason) {
    await database.query(
      `UPDATE charging_profile_log
       SET status = $1, responded_at = CURRENT_TIMESTAMP, reason = $2
       WHERE id = $3 AND status = 'SENT'`,
      [status, reason, profile.id]
    );
    const finished = { ...profile, status, reason };
    if (status === 'REJECTED' || status === 'NOT_SUPPORTED') {
      await rejectProfile(finished, status, reason);
    } else if (profile.attempt > PROFILE_RETRY_LIMIT && status !== 'ACCEPTED') {
      await alertUnconfirmed(finished, status, reason);
    }
    return finished;
  }

  async function reconcileTerminalProfiles() {
    const result = await database.query(
      `SELECT DISTINCT ON (l.session_id)
              l.id, l.attempt, l.status, l.station_id::text, l.charge_point_id::text,
              l.connector_id::text, l.session_id::text, l.transaction_id, l.limit_w,
              l.trigger, l.reason, cp.code AS charge_point_code, c.connector_no
       FROM charging_profile_log l
       JOIN charge_points cp ON cp.id = l.charge_point_id
       JOIN connectors c ON c.id = l.connector_id
       WHERE l.status IN ('OFFLINE', 'TIMEOUT')
         AND l.attempt > $1
         AND NOT EXISTS (
           SELECT 1 FROM charging_profile_log newer
           WHERE newer.session_id = l.session_id AND newer.id > l.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM alerts a
           WHERE a.kind = 'POWER_UNCONFIRMED'
             AND a.dedup_key = 'session:' || l.session_id::text
         )
       ORDER BY l.session_id, l.id DESC
       LIMIT $2`,
      [PROFILE_RETRY_LIMIT, batchSize]
    );
    for (const profile of result.rows || []) {
      await alertUnconfirmed(profile, profile.status, profile.reason);
    }

    const rejected = await database.query(
      `SELECT DISTINCT ON (l.session_id)
              l.id, l.attempt, l.status, l.station_id::text, l.charge_point_id::text,
              l.connector_id::text, l.session_id::text, l.transaction_id, l.limit_w,
              l.trigger, l.reason, cp.code AS charge_point_code, c.connector_no
       FROM charging_profile_log l
       JOIN charge_points cp ON cp.id = l.charge_point_id
       JOIN connectors c ON c.id = l.connector_id
       WHERE l.status IN ('REJECTED', 'NOT_SUPPORTED')
         AND NOT EXISTS (
           SELECT 1 FROM charging_profile_log newer
           WHERE newer.session_id = l.session_id AND newer.id > l.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM alerts a
           WHERE a.kind = 'POWER_PROFILE_REJECTED'
             AND a.dedup_key = 'session:' || l.session_id::text
         )
       ORDER BY l.session_id, l.id DESC
       LIMIT $1`,
      [batchSize]
    );
    for (const profile of rejected.rows || []) {
      await rejectProfile(profile, profile.status, profile.reason);
    }
  }

  async function processDuePowerProfiles() {
    if (!commandSender) throw new Error('OCPP command sender is not configured');
    await expireUnansweredProfiles();
    const dueProfiles = await loadDueProfiles();
    let retried = 0;
    for (const due of dueProfiles) {
      const profile = await claimProfile(due);
      if (!profile) continue;
      let status;
      let reason = null;
      try {
        const response = await commandSender.send(
          profile.charge_point_code,
          'SetChargingProfile',
          buildChargingProfilePayload(profile)
        );
        if (response?.status === 'Accepted') status = 'ACCEPTED';
        else if (response?.status === 'Rejected') status = 'REJECTED';
        else if (response?.status === 'NotSupported') status = 'NOT_SUPPORTED';
        else throw new Error(`Invalid SetChargingProfile response: ${response?.status}`);
      } catch (error) {
        const failure = commandFailure(error);
        status = failure.status;
        reason = failure.reason;
      }
      await recordResult(profile, status, reason);
      retried += 1;
    }
    await reconcileTerminalProfiles();
    if (retried > 0) logInfo(`[Job] Retried ${retried} charging profile(s)`);
    return { retried };
  }

  return { processDuePowerProfiles };
}

function startPowerProfileRetryJob({
  db,
  commandSender,
  onProfileRejected,
  onProfileUnconfirmed,
  commandTimeoutSeconds,
  batchSize,
  intervalMs = PROFILE_RETRY_INTERVAL_MS,
  logInfo = console.info,
  logError = console.error,
} = {}) {
  let running = false;
  const job = createPowerProfileRetryJob({
    db,
    commandSender,
    onProfileRejected,
    onProfileUnconfirmed,
    commandTimeoutSeconds,
    batchSize,
    logInfo,
  });

  async function run() {
    if (running) return;
    running = true;
    try {
      await job.processDuePowerProfiles();
    } catch (error) {
      logError(`[Job] Failed to retry charging profiles: ${sanitizeErrorMessage(error?.message || error)}`);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  PROFILE_RETRY_DELAYS_SECONDS,
  PROFILE_RETRY_INTERVAL_MS,
  createPowerProfileRetryJob,
  processDuePowerProfiles: (options) => createPowerProfileRetryJob(options).processDuePowerProfiles(),
  startPowerProfileRetryJob,
};
