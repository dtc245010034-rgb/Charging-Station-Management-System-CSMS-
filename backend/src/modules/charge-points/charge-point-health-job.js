const { sanitizeErrorMessage } = require('../../lib/constants');

const HEALTH_SCAN_INTERVAL_MS = 60_000;
const OFFLINE_THRESHOLD_MINUTES = 10;
const ERROR_WINDOW_MINUTES = 30;
const ERROR_THRESHOLD = 5;

async function scanChargePointHealth({ db = require('../../db/pool').pool } = {}) {
  const candidates = await db.query(
    `SELECT cp.id AS charge_point_id, cp.station_id, s.owner_id,
            CASE
              WHEN cp.status = 'OFFLINE'
               AND cp.last_seen_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
              THEN 'CHARGE_POINT_OFFLINE'
              ELSE 'CHARGE_POINT_REPEATED_ERRORS'
            END AS kind,
            CASE
              WHEN cp.status = 'OFFLINE'
               AND cp.last_seen_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
              THEN 'Trụ sạc đã ngoại tuyến hơn 10 phút'
              ELSE 'Trụ sạc báo lỗi ít nhất 5 lần trong 30 phút'
            END AS message,
            CASE
              WHEN cp.status = 'OFFLINE'
               AND cp.last_seen_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
              THEN 0
              ELSE COUNT(e.id)::int
            END AS recent_errors
     FROM charge_points cp
     JOIN stations s ON s.id = cp.station_id
     LEFT JOIN connector_errors e
       ON e.charge_point_id = cp.id
      AND e.recorded_at >= CURRENT_TIMESTAMP - INTERVAL '30 minutes'
     GROUP BY cp.id, s.owner_id
     HAVING (cp.status = 'OFFLINE'
             AND cp.last_seen_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
         OR COUNT(e.id) >= 5
     ORDER BY cp.id`
  );
  let created = 0;

  for (const candidate of candidates.rows) {
    const kind = candidate.kind;
    const dedupKey = `charge-point:${candidate.charge_point_id}:${kind}`;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO alerts (kind, severity, station_id, charge_point_id, message, details, dedup_key)
         VALUES ($1, 'WARNING', $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (kind, dedup_key) WHERE closed_at IS NULL DO NOTHING
         RETURNING id`,
        [
          kind,
          candidate.station_id,
          candidate.charge_point_id,
          candidate.message,
          JSON.stringify({ recentErrors: candidate.recent_errors }),
          dedupKey,
        ]
      );
      created += inserted.rowCount;
      const alert = await client.query(
        `SELECT id FROM alerts
         WHERE kind = $1 AND dedup_key = $2 AND closed_at IS NULL
           AND notified_at IS NULL
         FOR UPDATE SKIP LOCKED`,
        [kind, dedupKey]
      );
      if (alert.rowCount) {
        await client.query(
          `INSERT INTO email_outbox (user_id, subject, body)
           SELECT DISTINCT u.id, 'Trụ sạc cần kiểm tra', $1
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
           WHERE u.disabled_at IS NULL
             AND (r.code IN ('ADMIN', 'OPERATOR') OR u.id = $2)`,
          [candidate.message, candidate.owner_id]
        );
        await client.query(
          'UPDATE alerts SET notified_at = CURRENT_TIMESTAMP WHERE id = $1 AND notified_at IS NULL',
          [alert.rows[0].id]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return { created };
}

function startChargePointHealthJob({
  db,
  intervalMs = HEALTH_SCAN_INTERVAL_MS,
  logError = console.error,
} = {}) {
  let running = false;
  async function run() {
    if (running) return;
    running = true;
    try {
      await scanChargePointHealth({ db });
    } catch (error) {
      logError(`[Job] Failed to scan charge-point health: ${sanitizeErrorMessage(error?.message || error)}`);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  HEALTH_SCAN_INTERVAL_MS,
  OFFLINE_THRESHOLD_MINUTES,
  ERROR_WINDOW_MINUTES,
  ERROR_THRESHOLD,
  scanChargePointHealth,
  startChargePointHealthJob,
};
