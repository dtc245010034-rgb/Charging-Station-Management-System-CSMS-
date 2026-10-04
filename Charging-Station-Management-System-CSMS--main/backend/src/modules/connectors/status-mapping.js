const OCPP_CONNECTOR_STATUS_MAP = Object.freeze({
  Available: 'AVAILABLE',
  Preparing: 'OCCUPIED',
  Charging: 'OCCUPIED',
  SuspendedEV: 'OCCUPIED',
  SuspendedEVSE: 'OCCUPIED',
  Finishing: 'OCCUPIED',
  Reserved: 'RESERVED',
  Unavailable: 'UNAVAILABLE',
  Faulted: 'ERROR',
});

const UNKNOWN_CONNECTOR_STATUS = 'ERROR';

function mapOcppConnectorStatus(status) {
  return Object.hasOwn(OCPP_CONNECTOR_STATUS_MAP, status)
    ? OCPP_CONNECTOR_STATUS_MAP[status]
    : UNKNOWN_CONNECTOR_STATUS;
}

module.exports = {
  OCPP_CONNECTOR_STATUS_MAP,
  UNKNOWN_CONNECTOR_STATUS,
  mapOcppConnectorStatus,
};
