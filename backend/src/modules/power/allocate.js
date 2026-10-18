const { rebalanceCapacity } = require('./plan');

function rebalanceStation({ stationLimitKw, activeSessions = [] }) {
  return rebalanceCapacity({ stationLimitKw, activeSessions });
}

module.exports = { rebalanceStation, rebalanceCapacity };
