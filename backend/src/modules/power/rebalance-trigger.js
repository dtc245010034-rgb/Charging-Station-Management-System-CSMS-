'use strict';

const { sanitizeErrorMessage } = require('../../lib/constants');

function triggerPowerRebalance(rebalanceStation, stationId, reason, logError = console.error) {
  if (typeof rebalanceStation !== 'function' || stationId === undefined || stationId === null) return;
  try {
    Promise.resolve(rebalanceStation(stationId, { reason })).catch((error) => {
      logError(
        `[OCPP] ${reason}: power rebalance failed for station ${stationId}:`,
        sanitizeErrorMessage(error?.message || error)
      );
    });
  } catch (error) {
    logError(
      `[OCPP] ${reason}: power rebalance failed for station ${stationId}:`,
      sanitizeErrorMessage(error?.message || error)
    );
  }
}

module.exports = { triggerPowerRebalance };
