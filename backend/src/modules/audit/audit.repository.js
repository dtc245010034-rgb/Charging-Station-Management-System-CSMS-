const { prepare } = require('../../db/pool');

const record = (userId, action, entity, entityId, metadata = {}, ip = null) =>
  prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata, ip) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId || null, action, entity, entityId || null, JSON.stringify(metadata), ip);

module.exports = { record };
