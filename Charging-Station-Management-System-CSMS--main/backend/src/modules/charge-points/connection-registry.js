const { STATION_LOCKED_CLOSE_CODE, STATION_LOCKED_CLOSE_REASON } = require('../../lib/constants');

const connections = new Map();

const keyFor = (code) => String(code).trim().toUpperCase();

const CLOSE_GRACE_MS = 1500;

// ws chờ ~30 giây trước khi tự hủy socket nếu đối phương không trả close frame; ở đây chỉ chờ ngắn rồi terminate.
function closeWithGrace(ws, code, reason, graceMs = CLOSE_GRACE_MS) {
  try {
    ws.close(code, reason);
  } catch {
    try {
      ws.terminate();
    } catch {
      /* ignore */
    }
    return;
  }
  if (typeof ws.once !== 'function') return;
  const timer = setTimeout(() => {
    try {
      ws.terminate();
    } catch {
      /* ignore */
    }
  }, graceMs);
  if (typeof timer.unref === 'function') timer.unref();
  ws.once('close', () => clearTimeout(timer));
}

function connect(code, connection, { stationId } = {}) {
  const key = keyFor(code);
  const previous = connections.get(key);
  if (previous && previous !== connection) {
    previous.isReplacedByNewConnection = true;
    closeWithGrace(previous, 1000);
  }
  if (stationId !== undefined) {
    connection.stationId = stationId;
  }
  connections.set(key, connection);
}

function disconnect(code, connection) {
  const key = keyFor(code);
  if (connection === undefined) {
    const existed = connections.has(key);
    connections.delete(key);
    return existed;
  }
  if (connections.get(key) === connection) {
    connections.delete(key);
    return true;
  }
  return false;
}

const isConnected = (code) => connections.has(keyFor(code));
const getConnection = (code) => connections.get(keyFor(code));

function closeStationConnections(stationId, {
  code = STATION_LOCKED_CLOSE_CODE,
  reason = STATION_LOCKED_CLOSE_REASON,
  chargePointCodes = null,
} = {}) {
  const targetStationId = stationId !== undefined && stationId !== null ? String(stationId) : null;
  const targetCodes = Array.isArray(chargePointCodes) ? new Set(chargePointCodes.map(keyFor)) : null;
  const closed = [];

  for (const [key, ws] of connections.entries()) {
    const wsStationId = ws.stationId !== undefined && ws.stationId !== null
      ? String(ws.stationId)
      : (ws.chargePoint?.station_id !== undefined && ws.chargePoint?.station_id !== null ? String(ws.chargePoint.station_id) : null);

    const matchesStation = targetStationId !== null && wsStationId === targetStationId;
    const matchesCode = targetCodes !== null && targetCodes.has(key);

    if (matchesStation || matchesCode) {
      ws.isStationLocked = true;
      ws.isBootAccepted = false;
      closeWithGrace(ws, code, reason);
      closed.push(key);
    }
  }

  return closed;
}

const closeStationConnection = closeStationConnections;

module.exports = {
  closeWithGrace,
  connect,
  disconnect,
  getConnection,
  isConnected,
  closeStationConnections,
  closeStationConnection,
};