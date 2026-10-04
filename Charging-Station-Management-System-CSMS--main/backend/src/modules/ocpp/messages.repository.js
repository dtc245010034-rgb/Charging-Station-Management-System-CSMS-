const { createHash } = require('node:crypto');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hashCall(action, payload) {
  return createHash('sha256').update(`${action}\n${JSON.stringify(payload ?? null)}`).digest('hex');
}

// The unique insert reserves the (charge point, message ID) pair before dispatch.
// An unfinished reservation is never stolen: doing so could run a slow handler twice.
function createMessageStore(pool, { pollMs = 25, waitMs = 10000 } = {}) {
  async function begin(chargePointId, messageId, action, payloadHash) {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const inserted = await pool.query(
        `INSERT INTO ocpp_messages (charge_point_id, message_id, action, payload_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1`,
        [chargePointId, messageId, action, payloadHash]
      );
      if (inserted.rowCount > 0) return { state: 'run' };

      const current = await pool.query(
        `SELECT action, payload_hash, response, (response IS NOT NULL) AS done
         FROM ocpp_messages WHERE charge_point_id = $1 AND message_id = $2`,
        [chargePointId, messageId]
      );
      const row = current.rows[0];
      if (!row) continue;
      if (row.done) {
        return {
          state: 'replay',
          response: row.response,
          contentMismatch: row.action !== action || row.payload_hash !== payloadHash,
        };
      }
      if (Date.now() >= deadline) throw new Error('Timed out waiting for a duplicate OCPP message to finish');
      await sleep(pollMs);
    }
  }

  async function complete(chargePointId, messageId, response) {
    const result = await pool.query(
      'UPDATE ocpp_messages SET response = $3::jsonb WHERE charge_point_id = $1 AND message_id = $2 AND response IS NULL',
      [chargePointId, messageId, JSON.stringify(response ?? {})]
    );
    if (result.rowCount !== 1) throw new Error('OCPP message reservation was not available to complete');
  }

  async function release(chargePointId, messageId) {
    await pool.query(
      'DELETE FROM ocpp_messages WHERE charge_point_id = $1 AND message_id = $2 AND response IS NULL',
      [chargePointId, messageId]
    );
  }

  async function purgeOlderThan(days) {
    const result = await pool.query(
      "DELETE FROM ocpp_messages WHERE created_at < CURRENT_TIMESTAMP - make_interval(days => $1::int)",
      [days]
    );
    return result.rowCount;
  }

  return { begin, complete, release, purgeOlderThan };
}

module.exports = { createMessageStore, hashCall };
