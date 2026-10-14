const { prepare } = require('../../db/pool');

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

const ghi_nhat_ky = (userId, action, entity, entityId, metadata = {}, result = null, ip = null, db = null) => {
  const values = [userId || null, action, entity, entityId || null, JSON.stringify(metadata), result, ip];
  if (db?.query) {
    return db.query(
      'INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, result, ip) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      values
    );
  }
  return prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, result, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(...values);
};

const record = (userId, action, entity, entityId, metadata = {}, ip = null, db = null, result = null) => (
  ghi_nhat_ky(userId, action, entity, entityId, metadata, result, ip, db)
);

async function list({ chargePoint = null, user = null, driverId = null, from = null, to = null, page = 1 }) {
  const filters = [];
  const values = [];
  const addFilter = (sql, value) => {
    values.push(value);
    filters.push(sql(`$${values.length}`));
  };
  if (chargePoint) {
    addFilter((parameter) => `(
      (al.entity = 'charge_point' AND EXISTS (
        SELECT 1 FROM charge_points candidate
        WHERE candidate.id = al.entity_id
          AND candidate.code ILIKE ${parameter} ESCAPE E'\\\\'
      ))
      OR (al.entity = 'charging_session' AND EXISTS (
        SELECT 1
        FROM charging_sessions cs
        JOIN charge_points candidate ON candidate.id = cs.charge_point_id
        WHERE cs.id = al.entity_id
          AND candidate.code ILIKE ${parameter} ESCAPE E'\\\\'
      ))
      OR EXISTS (
        SELECT 1 FROM charge_points candidate
        WHERE candidate.id::text = al.metadata ->> 'charge_point_id'
          AND candidate.code ILIKE ${parameter} ESCAPE E'\\\\'
      )
    )`, `%${escapeLike(chargePoint)}%`);
  }
  if (user) {
    const userFilters = [];
    if (/^\d+$/.test(user) && BigInt(user) <= 9223372036854775807n) {
      values.push(user);
      userFilters.push(`al.user_id = $${values.length}::bigint`);
    }
    values.push(`%${escapeLike(user)}%`);
    const userTextParameter = `$${values.length}`;
    userFilters.push(`EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = al.user_id
          AND (u.name ILIKE ${userTextParameter} ESCAPE E'\\\\' OR u.email ILIKE ${userTextParameter} ESCAPE E'\\\\')
      )`);
    filters.push(`(${userFilters.join(' OR ')})`);
  }
  if (driverId !== null) addFilter(
    (parameter) => `al.metadata ->> 'driver_id' = ${parameter}`,
    String(driverId)
  );
  if (from) addFilter(
    (parameter) => `al.created_at >= (${parameter}::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
    from
  );
  if (to) addFilter(
    (parameter) => `al.created_at < ((${parameter}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
    to
  );

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const fromAndJoins = `FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    LEFT JOIN LATERAL (
      SELECT candidate.code
      FROM charge_points candidate
      WHERE (al.entity = 'charge_point' AND candidate.id = al.entity_id)
         OR (al.entity = 'charging_session' AND EXISTS (
           SELECT 1 FROM charging_sessions cs
           WHERE cs.id = al.entity_id AND cs.charge_point_id = candidate.id
         ))
         OR candidate.id::text = (al.metadata ->> 'charge_point_id')
      ORDER BY CASE
        WHEN al.entity = 'charge_point' AND candidate.id = al.entity_id THEN 0
        WHEN al.entity = 'charging_session' AND EXISTS (
          SELECT 1 FROM charging_sessions cs
          WHERE cs.id = al.entity_id AND cs.charge_point_id = candidate.id
        ) THEN 1
        ELSE 2
      END
      LIMIT 1
    ) cp ON TRUE`;
  const pool = require('../../db/pool').pool;
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total FROM audit_logs al ${where}`,
    values
  );
  const offset = (page - 1) * 50;
  values.push(50, offset);
  const rows = await pool.query(
    `SELECT al.id, al.user_id, u.name AS user_name, al.action, al.entity, al.entity_id,
            cp.code AS charge_point_code, al.metadata, al.result, al.ip, al.created_at
     ${fromAndJoins}
     ${where}
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return {
    items: rows.rows.map((row) => ({
      ...row,
      metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? row.metadata
        : {},
      result: row.result ?? null,
    })),
    page,
    pageSize: 50,
    total: Number(count.rows[0].total),
  };
}

module.exports = { ghi_nhat_ky, record, list };
