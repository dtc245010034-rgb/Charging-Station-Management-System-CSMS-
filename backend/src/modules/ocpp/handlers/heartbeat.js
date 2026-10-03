const { OcppCallError } = require('../frames');

// HeartbeatRequest theo OCPP 1.6 không có trường nào: chỉ nhận đúng {}.
function createHeartbeatHandler({ now = () => new Date().toISOString() } = {}) {
  return async function handleHeartbeat(payload) {
    const isEmptyObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 0;
    if (!isEmptyObject) throw new OcppCallError('FormationViolation', 'HeartbeatRequest must be an empty object');
    return { currentTime: now() };
  };
}

module.exports = { createHeartbeatHandler };
