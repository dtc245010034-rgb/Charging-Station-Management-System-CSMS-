const { pool } = require('../../db/pool');
const { sanitizeErrorMessage } = require('../../lib/constants');

const OCPP_FLUSH_INTERVAL_MS = 10_000;
const SNAPSHOT_INTERVAL_MS = 60_000;
const POINT_COUNT = 288;
const POINT_INTERVAL_MINUTES = 5;

function minuteStart(value) {
  const date = new Date(value);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

function createHealthMetrics() {
  const pending = new Map();

  function recordOcppCall({ durationMs, failed = false, at = new Date() }) {
    if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
      throw new TypeError('durationMs must be a non-negative safe integer');
    }
    const minuteAt = minuteStart(at);
    const metrics = pending.get(minuteAt) || { calls: 0, errors: 0, latency: 0 };
    metrics.calls += 1;
    if (failed) metrics.errors += 1;
    metrics.latency += durationMs;
    pending.set(minuteAt, metrics);
  }

  async function flush(db = pool) {
    for (const [minuteAt, metrics] of [...pending]) {
      pending.delete(minuteAt);
      try {
        await db.query(
          `INSERT INTO health_minutes (minute_at, ocpp_calls, ocpp_errors, latency_sum_ms)
           VALUES ($1::timestamptz, $2, $3, $4)
           ON CONFLICT (minute_at) DO UPDATE
           SET ocpp_calls = health_minutes.ocpp_calls + EXCLUDED.ocpp_calls,
               ocpp_errors = health_minutes.ocpp_errors + EXCLUDED.ocpp_errors,
               latency_sum_ms = health_minutes.latency_sum_ms + EXCLUDED.latency_sum_ms`,
          [minuteAt, metrics.calls, metrics.errors, metrics.latency]
        );
      } catch (error) {
        const arrivals = pending.get(minuteAt) || { calls: 0, errors: 0, latency: 0 };
        pending.set(minuteAt, {
          calls: arrivals.calls + metrics.calls,
          errors: arrivals.errors + metrics.errors,
          latency: arrivals.latency + metrics.latency,
        });
        throw error;
      }
    }
  }

  return { recordOcppCall, flush };
}

async function captureHealthSnapshot({ db = pool, at = new Date() } = {}) {
  const minuteAt = minuteStart(at);
  await db.query(
    `INSERT INTO health_minutes (minute_at, cps_online, cps_total, sessions_active)
     SELECT $1::timestamptz,
            (SELECT COUNT(*)::int FROM charge_points WHERE status = 'ONLINE'),
            (SELECT COUNT(*)::int FROM charge_points),
            (SELECT COUNT(*)::int FROM charging_sessions WHERE status = 'CHARGING')
     ON CONFLICT (minute_at) DO UPDATE
     SET cps_online = EXCLUDED.cps_online,
         cps_total = EXCLUDED.cps_total,
         sessions_active = EXCLUDED.sessions_active,
         recorded_at = CURRENT_TIMESTAMP`,
    [minuteAt]
  );
}

async function overview({ db = pool, now = new Date() } = {}) {
  const currentBucket = new Date(now);
  currentBucket.setUTCSeconds(0, 0);
  currentBucket.setUTCMinutes(Math.floor(currentBucket.getUTCMinutes() / POINT_INTERVAL_MINUTES) * POINT_INTERVAL_MINUTES);
  const firstBucket = new Date(currentBucket.getTime() - (POINT_COUNT - 1) * POINT_INTERVAL_MINUTES * 60_000);
  const result = await db.query(
    `WITH buckets AS (
       SELECT generate_series($1::timestamptz, $2::timestamptz, INTERVAL '5 minutes') AS bucket_at
     )
     SELECT b.bucket_at,
            COALESCE(SUM(h.ocpp_calls), 0)::bigint AS ocpp_calls,
            COALESCE(SUM(h.ocpp_errors), 0)::bigint AS ocpp_errors,
            COALESCE(SUM(h.latency_sum_ms), 0)::bigint AS latency_sum_ms,
            COALESCE((ARRAY_AGG(h.cps_online ORDER BY h.minute_at DESC)
              FILTER (WHERE h.minute_at IS NOT NULL))[1], 0)::int AS cps_online,
            COALESCE((ARRAY_AGG(h.cps_total ORDER BY h.minute_at DESC)
              FILTER (WHERE h.minute_at IS NOT NULL))[1], 0)::int AS cps_total,
            COALESCE((ARRAY_AGG(h.sessions_active ORDER BY h.minute_at DESC)
              FILTER (WHERE h.minute_at IS NOT NULL))[1], 0)::int AS sessions_active
     FROM buckets b
     LEFT JOIN health_minutes h
       ON h.minute_at >= b.bucket_at AND h.minute_at < b.bucket_at + INTERVAL '5 minutes'
     GROUP BY b.bucket_at
     ORDER BY b.bucket_at`,
    [firstBucket.toISOString(), currentBucket.toISOString()]
  );
  const points = result.rows.map((row) => ({
    at: row.bucket_at,
    ocpp_calls: Number(row.ocpp_calls),
    ocpp_errors: Number(row.ocpp_errors),
    latency_sum_ms: Number(row.latency_sum_ms),
    cps_online: Number(row.cps_online),
    cps_total: Number(row.cps_total),
    sessions_active: Number(row.sessions_active),
  }));

  const series = result.rows.map((row) => {
    const ocppCalls = Number(row.ocpp_calls);
    const latencySum = Number(row.latency_sum_ms);
    return {
      t: row.bucket_at,
      cpsOnline: Number(row.cps_online),
      sessionsActive: Number(row.sessions_active),
      errors: Number(row.ocpp_errors),
      latencyAvgMs: ocppCalls > 0 ? Math.round(latencySum / ocppCalls) : 0,
    };
  });

  // Snapshot trong health_minutes chỉ chụp mỗi SNAPSHOT_INTERVAL_MS nên trụ vừa Boot chưa được tính tới lúc chụp kế tiếp.
  // Số liệu "hiện tại" lấy trực tiếp từ bảng (3 COUNT rẻ); lịch sử vẫn từ snapshot, điểm cuối của biểu đồ khớp số hiện tại.
  const live = (await db.query(
    `SELECT (SELECT COUNT(*)::int FROM charge_points WHERE status = 'ONLINE') AS cps_online,
            (SELECT COUNT(*)::int FROM charge_points) AS cps_total,
            (SELECT COUNT(*)::int FROM charging_sessions WHERE status = 'CHARGING') AS sessions_active`
  )).rows[0];
  const lastPoint = points.at(-1);
  if (lastPoint) {
    lastPoint.cps_online = Number(live.cps_online);
    lastPoint.cps_total = Number(live.cps_total);
    lastPoint.sessions_active = Number(live.sessions_active);
    series.at(-1).cpsOnline = lastPoint.cps_online;
    series.at(-1).sessionsActive = lastPoint.sessions_active;
  }

  const latest = points.at(-1) || {};
  const latestCalls = Number(latest.ocpp_calls || 0);
  const latestLatencySum = Number(latest.latency_sum_ms || 0);

  return {
    generatedAt: now.toISOString(),
    now: {
      cpsOnline: Number(latest.cps_online || 0),
      cpsTotal: Number(latest.cps_total || 0),
      sessionsActive: Number(latest.sessions_active || 0),
      errors5m: Number(latest.ocpp_errors || 0),
      latencyAvgMs5m: latestCalls > 0 ? Math.round(latestLatencySum / latestCalls) : 0,
    },
    series,
    points,
  };
}

async function purgeOldMetrics({ db = pool } = {}) {
  const result = await db.query("DELETE FROM health_minutes WHERE minute_at < CURRENT_TIMESTAMP - INTERVAL '8 days'");
  return { deleted: result.rowCount };
}

function startHealthMetricsJob({
  db = pool,
  metrics = createHealthMetrics(),
  logError = console.error,
} = {}) {
  let running = false;
  async function run() {
    if (running) return;
    running = true;
    try {
      await metrics.flush(db);
    } catch (error) {
      logError(`[Health] Failed to flush OCPP metrics: ${sanitizeErrorMessage(error?.message || error)}`);
    } finally {
      running = false;
    }
  }
  async function snapshot() {
    try {
      await captureHealthSnapshot({ db });
    } catch (error) {
      logError(`[Health] Failed to capture system snapshot: ${sanitizeErrorMessage(error?.message || error)}`);
    }
  }
  async function purge() {
    try {
      await purgeOldMetrics({ db });
    } catch (error) {
      logError(`[Health] Failed to purge old metrics: ${sanitizeErrorMessage(error?.message || error)}`);
    }
  }
  const flushTimer = setInterval(() => { void run(); }, OCPP_FLUSH_INTERVAL_MS);
  const snapshotTimer = setInterval(() => { void snapshot(); }, SNAPSHOT_INTERVAL_MS);
  const purgeTimer = setInterval(() => { void purge(); }, 3600_000);
  flushTimer.unref?.();
  snapshotTimer.unref?.();
  purgeTimer.unref?.();
  void run();
  void snapshot();
  void purge();
  return { run, snapshot, purge, stop: () => { clearInterval(flushTimer); clearInterval(snapshotTimer); clearInterval(purgeTimer); } };
}

module.exports = {
  OCPP_FLUSH_INTERVAL_MS,
  SNAPSHOT_INTERVAL_MS,
  createHealthMetrics,
  captureHealthSnapshot,
  overview,
  purgeOldMetrics,
  startHealthMetricsJob,
};
