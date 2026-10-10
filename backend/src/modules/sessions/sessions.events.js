const { findSessionById } = require('./sessions.repository');
const { formatSession } = require('./sessions.service');
const { sanitizeErrorMessage } = require('../../lib/constants');

const subscribers = new Map(); // listener -> driverId (chuỗi)
const tails = new Map(); // sessionId -> Promise của lần phát gần nhất, để các lần phát cùng phiên chạy tuần tự

function subscribe(listener, { driverId } = {}) {
  if (typeof listener !== 'function') throw new TypeError('listener must be a function');
  if (driverId === undefined || driverId === null) throw new TypeError('driverId is required');
  subscribers.set(listener, String(driverId));
  return () => subscribers.delete(listener);
}

function hasSubscriberFor(driverId) {
  if (driverId === undefined || driverId === null) return false;
  const target = String(driverId);
  for (const id of subscribers.values()) {
    if (id === target) return true;
  }
  return false;
}

// Một người nghe hỏng không được chặn người nghe khác hay làm hỏng handler OCPP đang gọi publish().
function publish(event) {
  const target = String(event.driverId);
  for (const [listener, id] of subscribers) {
    if (id !== target) continue;
    try {
      listener(event);
    } catch {
      subscribers.delete(listener);
    }
  }
}

async function snapshot(sessionId, { pool, logError }) {
  try {
    const client = pool || require('../../db/pool').pool;
    const row = await findSessionById(client, sessionId);
    if (!row || !row.driver_id) return;
    if (!hasSubscriberFor(row.driver_id)) return;
    const formatted = formatSession(row);
    publish({
      driverId: row.driver_id,
      sessionId: row.id,
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
    // Bộ ghi log hỏng cũng không được làm reject hay kẹt hàng đợi của phiên.
    try {
      logError('[SSE] Không phát được sự kiện phiên sạc', sessionId, sanitizeErrorMessage(error?.message || error));
    } catch {
      // bỏ qua
    }
  }
}

// driverId: tài xế sở hữu phiên theo handler đang gọi; chỉ truy vấn khi có người đang nghe tài xế đó.
function publishSessionUpdateFromDb(sessionId, { pool = null, driverId, logError = console.error } = {}) {
  if (!hasSubscriberFor(driverId)) return Promise.resolve();

  const run = () => snapshot(sessionId, { pool, logError });
  const previous = tails.get(sessionId) || Promise.resolve();
  const next = previous.then(run, run);
  tails.set(sessionId, next);
  const settle = () => {
    if (tails.get(sessionId) === next) tails.delete(sessionId);
  };
  next.then(settle, settle);
  return next;
}

const pendingCount = () => tails.size;

module.exports = {
  subscribe,
  publish,
  hasSubscriberFor,
  publishSessionUpdateFromDb,
  pendingCount,
};
