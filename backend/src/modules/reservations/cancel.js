function asDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function evaluateDriverCancellation({ reservation = {}, now = new Date() } = {}) {
  const status = String(pickFirst(reservation.status, 'HELD') || 'HELD').toUpperCase();
  const currentTime = asDate(now) ?? new Date();
  const expiresAt = asDate(pickFirst(
    reservation.expires_at,
    reservation.expiresAt,
    reservation.expiryAt,
    reservation.expires_at_utc,
  ));
  const startedAt = asDate(pickFirst(
    reservation.started_at,
    reservation.startedAt,
    reservation.started_at_utc,
    reservation.startAt,
  ));

  if (status === 'CANCELLED' || status === 'CANCELED') {
    return {
      allowed: false,
      reason: 'ALREADY_CANCELLED',
      feeDong: 0,
      stationCommand: null,
      stationStatus: null,
    };
  }

  if (startedAt && currentTime >= startedAt) {
    return {
      allowed: false,
      reason: 'ALREADY_STARTED',
      feeDong: 0,
      stationCommand: null,
      stationStatus: null,
    };
  }

  if (expiresAt && currentTime >= expiresAt) {
    return {
      allowed: false,
      reason: 'EXPIRED_ALREADY',
      feeDong: 0,
      stationCommand: null,
      stationStatus: null,
    };
  }

  if (status === 'HELD' && expiresAt && currentTime < expiresAt) {
    return {
      allowed: true,
      reason: 'DRIVER_CANCELLED_BEFORE_EXPIRY',
      feeDong: 0,
      stationCommand: 'CancelReservation',
      stationStatus: 'Available',
    };
  }

  return {
    allowed: false,
    reason: 'CANCEL_NOT_ALLOWED',
    feeDong: 0,
    stationCommand: null,
    stationStatus: null,
  };
}

module.exports = { evaluateDriverCancellation };
