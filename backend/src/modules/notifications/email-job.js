const { sanitizeErrorMessage } = require('../../lib/constants');
const env = require('../../config/env');

const EMAIL_SCAN_BATCH_SIZE = 25;
const EMAIL_SCAN_INTERVAL_MS = 30_000;
const MAX_EMAIL_ATTEMPTS = 5;

async function runEmailBatch({
  db = require('../../db/pool').pool,
  limit = EMAIL_SCAN_BATCH_SIZE,
  transport = env.EMAIL_TRANSPORT,
  logInfo = console.info,
  logError = console.error,
} = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('limit must be a positive safe integer');

  const client = await db.connect();
  const logs = [];
  let sent = 0;
  let failed = 0;
  try {
    await client.query('BEGIN');
    const selected = await client.query(
      `SELECT id, user_id, subject, attempts
       FROM email_outbox
       WHERE status = 'PENDING'
       ORDER BY created_at, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );

    for (const row of selected.rows) {
      if (transport === 'log') {
        await client.query(
          `UPDATE email_outbox
           SET status = 'SENT', attempts = attempts + 1, sent_at = CURRENT_TIMESTAMP,
               last_error = NULL
           WHERE id = $1`,
          [row.id]
        );
        logs.push(`[Email] user_id=${row.user_id} subject=${row.subject}`);
        sent += 1;
        continue;
      }

      const attempts = row.attempts + 1;
      const status = attempts >= MAX_EMAIL_ATTEMPTS ? 'FAILED' : 'PENDING';
      await client.query(
        `UPDATE email_outbox
         SET status = $2, attempts = $3, last_error = 'EMAIL_TRANSPORT_UNSUPPORTED'
         WHERE id = $1`,
        [row.id, status, attempts]
      );
      failed += 1;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logError('[Email] Không thể xử lý hộp thư:', sanitizeErrorMessage(error?.message || error));
    throw error;
  } finally {
    client.release();
  }

  for (const line of logs) logInfo(line);
  if (transport !== 'log' && failed > 0) {
    logError(`[Email] EMAIL_TRANSPORT=${transport} chưa được hỗ trợ; đã thử lại ${failed} thư`);
  }
  return { sent, failed };
}

function startEmailJob(options = {}) {
  let running = null;
  async function run() {
    if (!running) {
      running = runEmailBatch(options).finally(() => { running = null; });
    }
    return running;
  }

  const timer = setInterval(() => {
    void run().catch(() => {});
  }, options.intervalMs ?? EMAIL_SCAN_INTERVAL_MS);
  timer.unref?.();
  void run().catch(() => {});
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  EMAIL_SCAN_BATCH_SIZE,
  EMAIL_SCAN_INTERVAL_MS,
  MAX_EMAIL_ATTEMPTS,
  runEmailBatch,
  startEmailJob,
};
