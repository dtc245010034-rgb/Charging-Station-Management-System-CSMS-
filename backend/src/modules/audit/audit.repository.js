const { prepare } = require('../../db/pool');

const record = (userId, action, entity, entityId, metadata = {}, ip = null, db = null) => {
  const values = [userId || null, action, entity, entityId || null, JSON.stringify(metadata), ip];
  if (db?.query) {
    return db.query(
      'INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, ip) VALUES ($1, $2, $3, $4, $5, $6)',
      values
    );
  }
  return prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, ip) VALUES (?, ?, ?, ?, ?, ?)')
    .run(...values);
};

module.exports = { record };
