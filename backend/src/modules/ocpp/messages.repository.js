const { createHash } = require('node:crypto');

const MAX_MESSAGE_ID_LENGTH = 64;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hashCall(action, payload) {
  return createHash('sha256').update(`${action}\n${JSON.stringify(payload ?? null)}`).digest('hex');
}

// pollMs/waitMs: chờ tin trùng đang được xử lý ở nơi khác; staleMs: sau ngần ấy thì coi tin đang xử lý là bị bỏ rơi và xử lý lại.
// replayWindowSeconds: chỉ tin cùng hành động, cùng nội dung và còn trong cửa sổ này mới nhận lại câu cũ; ngoài ra là tin mới (trụ khởi động lại đếm lại messageId).
function createMessageStore(pool, { pollMs = 25, waitMs = 10000, staleMs = 30000, replayWindowSeconds = 600 } = {}) {
  async function begin(code, messageId, action, payloadHash) {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const inserted = await pool.query(
        `INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING 1`,
        [code, messageId, action, payloadHash]
      );
      if (inserted.rowCount > 0) return { state: 'run' };

      const current = await pool.query(
        `SELECT action, payload_hash, response, (response IS NOT NULL) AS done,
                created_at < CURRENT_TIMESTAMP - make_interval(secs => $3::float8) AS stale,
                created_at < CURRENT_TIMESTAMP - make_interval(secs => $4::float8) AS expired
         FROM ocpp_messages WHERE charge_point_code = $1 AND message_id = $2`,
        [code, messageId, staleMs / 1000, replayWindowSeconds]
      );
      const row = current.rows[0];
      if (!row) continue;
      if (row.done) {
        const sameCall = row.action === action && row.payload_hash === payloadHash;
        if (sameCall && !row.expired) return { state: 'replay', response: row.response };
        // Một UPDATE duy nhất để chỉ một bên thắng; bên thua quay lại vòng lặp và thấy tin đang xử lý.
        const reused = await pool.query(
          `UPDATE ocpp_messages SET created_at = CURRENT_TIMESTAMP, action = $3, payload_hash = $4, response = NULL
           WHERE charge_point_code = $1 AND message_id = $2 AND response IS NOT NULL
             AND (action <> $3 OR payload_hash <> $4 OR created_at < CURRENT_TIMESTAMP - make_interval(secs => $5::float8))
           RETURNING 1`,
          [code, messageId, action, payloadHash, replayWindowSeconds]
        );
        if (reused.rowCount > 0) return { state: 'run' };
        continue;
      }
      if (row.stale) {
        const taken = await pool.query(
          `UPDATE ocpp_messages SET created_at = CURRENT_TIMESTAMP, action = $3, payload_hash = $4
           WHERE charge_point_code = $1 AND message_id = $2 AND response IS NULL
             AND created_at < CURRENT_TIMESTAMP - make_interval(secs => $5::float8) RETURNING 1`,
          [code, messageId, action, payloadHash, staleMs / 1000]
        );
        if (taken.rowCount > 0) return { state: 'run' };
        continue;
      }
      if (Date.now() >= deadline) throw new Error('Timed out waiting for a duplicate OCPP message to finish');
      await sleep(pollMs);
    }
  }

  async function complete(code, messageId, response) {
    await pool.query(
      'UPDATE ocpp_messages SET response = $3::jsonb WHERE charge_point_code = $1 AND message_id = $2',
      [code, messageId, JSON.stringify(response ?? {})]
    );
  }

  async function release(code, messageId) {
    await pool.query(
      'DELETE FROM ocpp_messages WHERE charge_point_code = $1 AND message_id = $2 AND response IS NULL',
      [code, messageId]
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

module.exports = { createMessageStore, hashCall, MAX_MESSAGE_ID_LENGTH };
