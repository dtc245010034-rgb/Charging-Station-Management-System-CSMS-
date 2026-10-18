'use strict';

const { toLocalParts } = require('../billing/tz');

function effectiveLimitW({ baseLimitW, windows, timezone, at }) {
  if (baseLimitW !== null && baseLimitW !== undefined
    && (!Number.isSafeInteger(Number(baseLimitW)) || Number(baseLimitW) <= 0)) {
    throw new TypeError('baseLimitW must be a positive safe integer or null');
  }
  if (!Array.isArray(windows)) throw new TypeError('windows must be an array');

  const minuteOfDay = toLocalParts(at, timezone).minuteOfDay;
  const window = windows.find((item) => (
    minuteOfDay >= item.startMinute && minuteOfDay < item.endMinute
  ));
  if (window) {
    if (!Number.isSafeInteger(Number(window.limitW)) || Number(window.limitW) <= 0) {
      throw new TypeError('window limitW must be a positive safe integer');
    }
    return { limitW: Number(window.limitW), source: 'WINDOW', windowId: window.id };
  }
  return {
    limitW: baseLimitW === null || baseLimitW === undefined ? null : Number(baseLimitW),
    source: 'BASE',
  };
}

module.exports = { effectiveLimitW };
