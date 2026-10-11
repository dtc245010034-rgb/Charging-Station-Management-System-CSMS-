const { prepare } = require('../../db/pool');

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

const record = (userId, action, entity, entityId, metadata = {}, ip = null, db = null) => (
  ghi_nhat_ky(userId, action, entity, entityId, metadata, null, ip, db)
);

async function list({ chargePoint = null, user = null, from = null, to = null, page = 1 }) {
  const filters = [];
  const values = [];
  const addFilter = (sql, value) => {
    values.push(value);
    filters.push(sql.replace('?', `$${values.length}`));
  };
  if (chargePoint) addFilter("cp.code ILIKE '%' || ? || '%'", chargePoint);
  if (user) {
    values.push(user);
    const parameter = `$${values.length}`;
    filters.push(`(u.id::text = ${parameter} OR u.name ILIKE '%' || ${parameter} || '%' OR u.email ILIKE '%' || ${parameter} || '%')`);
  }
  if (from) addFilter('al.created_at >= ?::date', from);
  if (to) addFilter("al.created_at < (?::date + INTERVAL '1 day')", to);

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
  const countValues = [...values];
  const count = await require('../../db/pool').pool.query(
    `SELECT COUNT(*)::int AS total ${fromAndJoins} ${where}`,
    countValues
  );
  const offset = (page - 1) * 50;
  values.push(50, offset);
  const rows = await require('../../db/pool').pool.query(
    `SELECT al.id, al.user_id, u.name AS user_name, al.action, al.entity, al.entity_id,
            cp.code AS charge_point_code, al.metadata, al.result, al.created_at
     ${fromAndJoins}
     ${where}
     ORDER BY al.created_at DESC, al.id DESC
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return { items: rows.rows, page, pageSize: 50, total: count.rows[0].total };
}

module.exports = { ghi_nhat_ky, record, list };
