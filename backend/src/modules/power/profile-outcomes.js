'use strict';

const { sanitizeErrorMessage } = require('../../lib/constants');

function createPowerProfileOutcomeHandler({
  db,
  commandSender,
  requestRemoteStop = require('../sessions/sessions.service').requestRemoteStop,
  logError = console.error,
} = {}) {
  if (!db) throw new Error('Power profile outcome handler requires a database');

  async function openAlert(profile, kind, severity, message, details) {
    const result = await db.query(
      `INSERT INTO alerts (
         kind, severity, station_id, charge_point_id, connector_id, session_id, message, details, dedup_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       ON CONFLICT (kind, dedup_key) WHERE closed_at IS NULL DO NOTHING
       RETURNING id`,
      [
        kind,
        severity,
        profile.station_id,
        profile.charge_point_id,
        profile.connector_id,
        profile.session_id,
        message,
        JSON.stringify(details),
        `session:${profile.session_id}`,
      ]
    );
    return result.rowCount > 0;
  }

  async function onProfileRejected(profile, status, reason = null) {
    const existing = await db.query(
      `SELECT 1 FROM alerts
       WHERE kind = 'POWER_PROFILE_REJECTED'
         AND dedup_key = $1
         AND closed_at IS NULL
       LIMIT 1`,
      [`session:${profile.session_id}`]
    );
    if (existing.rowCount > 0) return;

    try {
      await requestRemoteStop({ id: null }, profile.session_id, { commandSender, db });
    } catch (error) {
      if (error?.code !== 'CONFLICT') {
        logError(`[Power] Remote stop after profile rejection failed for session ${profile.session_id}: ${sanitizeErrorMessage(error?.message || error)}`);
      }
    }
    await openAlert(
      profile,
      'POWER_PROFILE_REJECTED',
      'WARNING',
      'Charging profile was rejected; a remote stop was requested.',
      { status, limit_w: profile.limit_w, reason }
    );
  }

  async function onProfileUnconfirmed(profile, status, reason = null) {
    await openAlert(
      profile,
      'POWER_UNCONFIRMED',
      'CRITICAL',
      'Charging power limit could not be confirmed after retries.',
      { status, attempt: profile.attempt, limit_w: profile.limit_w, reason }
    );
  }

  return { onProfileRejected, onProfileUnconfirmed };
}

module.exports = { createPowerProfileOutcomeHandler };
