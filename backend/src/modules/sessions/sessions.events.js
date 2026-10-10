const subscribers = new Set();
const { findSessionById } = require('./sessions.repository');
const { formatSession } = require('./sessions.service');
const { sanitizeErrorMessage } = require('../../lib/constants');

function subscribe(listener) {
  if (typeof listener !== 'function') throw new TypeError('listener must be a function');
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

// Một người nghe hỏng không được chặn người nghe khác hay làm hỏng handler OCPP đang gọi publish().
function publish(event) {
  for (const listener of subscribers) {
    try {
      listener(event);
    } catch {
      subscribers.delete(listener);
    }
  }
}

async function publishSessionUpdateFromDb(sessionId, { pool: poolInstance = null, logError = console.error } = {}) {
  if (subscribers.size === 0) return;

  try {
    const client = poolInstance || require('../../db/pool').pool;
    const session = await findSessionById(client, sessionId);
    if (!session || !session.driver_id) return;
    const formatted = formatSession(session);
    publish({
      driverId: session.driver_id,
      sessionId: session.id,
      status: formatted.status,
      currentKwh: formatted.current_kwh,
      latestPowerW: formatted.latest_power_w,
      latestCurrentA: formatted.latest_current_a,
      latestSoc: formatted.latest_soc,
      sampledAt: formatted.latest_sampled_at,
      type: formatted.status === 'COMPLETED' ? 'session_stopped' : 'meter_value',
      session: formatted,
    });
  } catch (error) {
    logError('[SSE] Không phát được sự kiện phiên sạc', sessionId, sanitizeErrorMessage(error?.message || error));
  }
}

module.exports = {
  subscribe,
  publish,
  publishSessionUpdateFromDb,
};
