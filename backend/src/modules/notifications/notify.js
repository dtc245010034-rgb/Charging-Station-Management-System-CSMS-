const { sanitizeErrorMessage } = require('../../lib/constants');
const { pool } = require('../../db/pool');
const { listEnergySamples } = require('../sessions/meter-values.repository');
const { priceSession } = require('../billing/price-session');
const { findEffectiveTariff } = require('../billing/tariffs.repository');

const EVENT_TEXT = {
  SESSION_ENDED: 'Phiên sạc đã kết thúc',
  SESSION_REMOTE_STOPPED: 'Phiên sạc đã bị dừng từ xa',
  IDLE_FEE_STARTED: 'Phiên sạc bắt đầu tính phí chiếm trụ',
};

function formatKwh(wh) {
  if (wh === null || wh === undefined) return '';
  const value = BigInt(wh);
  if (value <= 0n) return '0';
  const whole = value / 1000n;
  const fraction = String(value % 1000n).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function safeInteger(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'bigint' && (typeof value !== 'string' || !/^-?\d+$/.test(value))) return null;
  const integer = BigInt(value);
  if (integer > BigInt(Number.MAX_SAFE_INTEGER) || integer < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(integer);
}

async function estimateSession(sessionId, db) {
  const result = await db.query(
    `SELECT cs.id, cs.driver_id, cs.meter_start, cs.meter_stop, cs.started_at,
            cs.stopped_at, cp.station_id, s.timezone
     FROM charging_sessions cs
     JOIN charge_points cp ON cp.id = cs.charge_point_id
     JOIN stations s ON s.id = cp.station_id
     WHERE cs.id = $1`,
    [sessionId]
  );
  const session = result.rows[0];
  if (!session || session.driver_id === null || session.meter_stop === null || !session.stopped_at) return null;

  if (BigInt(session.meter_stop) < BigInt(session.meter_start)) {
    return {
      driverId: session.driver_id,
      wh: null,
      estimatedDong: null,
    };
  }

  const wh = BigInt(session.meter_stop) - BigInt(session.meter_start);
  let estimatedDong = null;
  const tariff = await findEffectiveTariff(db, session.station_id, session.started_at);
  if (tariff) {
    const samples = await listEnergySamples(
      db,
      sessionId,
      session.started_at,
      session.stopped_at,
      session.meter_start
    );
    estimatedDong = priceSession({
      startedAt: session.started_at,
      stoppedAt: session.stopped_at,
      meterStartWh: session.meter_start,
      meterStopWh: session.meter_stop,
      samples,
      timezone: session.timezone,
      tariff: { periods: tariff.periods, idle: { graceMin: 0, perMinDong: 0 } },
    }).totalDong;
  }

  return {
    driverId: session.driver_id,
    wh: wh.toString(),
    estimatedDong: safeInteger(estimatedDong),
  };
}

async function notifySessionEvent({
  sessionId,
  kind,
  db = pool,
  logError = console.error,
}) {
  const description = EVENT_TEXT[kind];
  if (!description) throw new TypeError(`Unsupported session notification kind: ${kind}`);

  try {
    const estimate = await estimateSession(sessionId, db);
    if (!estimate) return { created: false };

    const amount = estimate.estimatedDong;
    const inserted = await db.query(
      `INSERT INTO notifications (user_id, kind, session_id, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (session_id, kind) DO NOTHING
       RETURNING id`,
      [estimate.driverId, kind, sessionId, JSON.stringify({ wh: estimate.wh, estimatedDong: amount })]
    );
    if (!inserted.rowCount) return { created: false };

    const estimateText = amount === null ? 'tạm tính: chưa có biểu giá' : `tạm tính ${amount} đ`;
    const kwhText = estimate.wh === null ? '' : `${formatKwh(estimate.wh)} kWh, `;
    try {
      await db.query(
        `INSERT INTO email_outbox (user_id, subject, body)
         VALUES ($1, $2, $3)`,
        [
          estimate.driverId,
          description,
          `${description}: ${kwhText}${estimateText}.`,
        ]
      );
    } catch (error) {
      logError('[Notifications] Không thể ghi email vào hộp thư:', sanitizeErrorMessage(error?.message || error));
    }
    return { created: true, notificationId: inserted.rows[0].id };
  } catch (error) {
    logError('[Notifications] Không thể tạo thông báo phiên:', sanitizeErrorMessage(error?.message || error));
    return { created: false };
  }
}

module.exports = { notifySessionEvent, estimateSession, formatKwh };
