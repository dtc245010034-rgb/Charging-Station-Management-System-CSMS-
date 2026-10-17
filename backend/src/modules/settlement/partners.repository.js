const { pool } = require('../../db/pool');

async function listPartners(actor) {
  const ownerId = actor.roles.includes('STATION_OWNER') ? actor.id : null;
  const result = await pool.query(
    `SELECT u.id::text AS owner_id, COUNT(DISTINCT s.id)::int AS station_count,
            current_rate.id::text AS rate_id, current_rate.share_bp, current_rate.include_idle,
            TO_CHAR(current_rate.effective_from, 'YYYY-MM-DD') AS effective_from
     FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id AND r.code = 'STATION_OWNER'
     LEFT JOIN stations s ON s.owner_id = u.id
     LEFT JOIN LATERAL (
       SELECT id, share_bp, include_idle, effective_from
       FROM partner_share_rates
       WHERE owner_id = u.id AND effective_from <= CURRENT_DATE
       ORDER BY effective_from DESC
       LIMIT 1
     ) current_rate ON TRUE
     WHERE ($1::bigint IS NULL OR u.id = $1)
     GROUP BY u.id, current_rate.id, current_rate.share_bp, current_rate.include_idle, current_rate.effective_from
     ORDER BY u.id`,
    [ownerId]
  );
  return result.rows.map((row) => ({
    ownerId: row.owner_id,
    stationCount: row.station_count,
    currentRate: row.rate_id === null ? null : {
      id: row.rate_id,
      shareBp: row.share_bp,
      includeIdle: row.include_idle,
      effectiveFrom: row.effective_from,
    },
  }));
}

async function isStationOwner(ownerId, db = pool) {
  const result = await db.query(
    `SELECT 1
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1 AND r.code = 'STATION_OWNER'`,
    [ownerId]
  );
  return result.rowCount > 0;
}

async function listRates(ownerId) {
  const result = await pool.query(
    `SELECT id::text, owner_id::text, share_bp, include_idle,
            TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from, note
     FROM partner_share_rates
     WHERE owner_id = $1
     ORDER BY effective_from DESC, id DESC`,
    [ownerId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    shareBp: row.share_bp,
    includeIdle: row.include_idle,
    effectiveFrom: row.effective_from,
    note: row.note,
  }));
}

async function insertRate(client, { ownerId, shareBp, includeIdle, effectiveFrom, note, createdBy }) {
  const result = await client.query(
    `INSERT INTO partner_share_rates (owner_id, share_bp, include_idle, effective_from, note, created_by)
     VALUES ($1, $2, $3, $4::date, $5, $6)
     RETURNING id::text, owner_id::text, share_bp, include_idle,
               TO_CHAR(effective_from, 'YYYY-MM-DD') AS effective_from, note`,
    [ownerId, shareBp, includeIdle, effectiveFrom, note, createdBy]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    ownerId: row.owner_id,
    shareBp: row.share_bp,
    includeIdle: row.include_idle,
    effectiveFrom: row.effective_from,
    note: row.note,
  };
}

module.exports = { listPartners, isStationOwner, listRates, insertRate };
