const repo = require('./alerts.repository');
const audit = require('./../audit/audit.repository');
const { denyOrNotFound } = require('../../lib/ownership');
const { withTransaction } = require('../../db/tx');

const list = (actor, state) => repo.list(actor, state);

async function close(actor, id, { ip = null } = {}) {
  const existing = await repo.findById(actor, id)
    || await denyOrNotFound(actor, 'alert', id, repo.existsById, 'Không tìm thấy cảnh báo');
  if (existing.closed_at) return existing;

  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE alerts SET closed_at = CURRENT_TIMESTAMP, closed_by = $2
       WHERE id = $1 AND closed_at IS NULL RETURNING *`,
      [id, actor.id]
    );
    if (!result.rowCount) {
      const current = await client.query('SELECT * FROM alerts WHERE id = $1', [id]);
      if (!current.rowCount) return denyOrNotFound(actor, 'alert', id, repo.existsById, 'Không tìm thấy cảnh báo');
      return current.rows[0];
    }

    const alert = result.rows[0];
    await audit.record(actor.id, 'ALERT_CLOSED', 'alert', id, {
      kind: alert.kind,
      station_id: alert.station_id,
    }, ip, client, 'CLOSED');
    return alert;
  });
}

module.exports = { list, close };
