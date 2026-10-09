const subscribers = new Set();
const { findSessionById } = require('./sessions.repository');
const { formatSession } = require('./sessions.service');

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

async function publishSessionUpdateFromDb(sessionId, { pool: poolInstance = null } = {}) {
  try {
    let client = poolInstance;
    if (!client) {
      if (!process.env.DATABASE_URL && process.env.CSMS_SKIP_DOTENV) {
        return;
      }
      client = require('../../db/pool').pool;
    }
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
  } catch {
    // Bỏ qua lỗi không làm gián đoạn tiến trình gọi
  }
}

module.exports = {
  subscribe,
  publish,
  publishSessionUpdateFromDb,
};
