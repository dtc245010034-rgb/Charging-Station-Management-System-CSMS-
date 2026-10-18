function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

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

function evaluateReservationExpiry({ reservation = {}, station = {}, now = new Date() } = {}) {
  const reservationId = pickFirst(
    reservation.id,
    reservation.reservationId,
    reservation.reservation_id,
    null,
  );
  const status = String(pickFirst(reservation.status, 'HELD') || 'HELD').toUpperCase();
  const currentTime = asDate(now) ?? new Date();
  const startedAt = asDate(pickFirst(
    reservation.started_at,
    reservation.startedAt,
    reservation.started_at_utc,
    reservation.startAt,
  ));
  const expiresAt = asDate(pickFirst(
    reservation.expires_at,
    reservation.expiresAt,
    reservation.expiryAt,
    reservation.expires_at_utc,
  ));

  if (startedAt && currentTime >= startedAt) {
    return {
      reservationId,
      state: status === 'ACTIVE' || status === 'STARTED' ? 'ACTIVE' : status,
      expired: false,
      shouldCancelReservation: false,
      noShowFeeDong: 0,
      stationCommand: null,
      stationStatus: null,
      reason: null,
    };
  }

  if (status === 'CANCELLED' || status === 'CANCELED' || status === 'EXPIRED') {
    return {
      reservationId,
      state: 'EXPIRED',
      expired: true,
      shouldCancelReservation: false,
      noShowFeeDong: 0,
      stationCommand: null,
      stationStatus: null,
      reason: status,
    };
  }

  if (expiresAt && currentTime >= expiresAt) {
    const fee = Math.max(0, asNumber(pickFirst(
      station.no_show_fee_dong,
      station.noShowFeeDong,
      station.no_show_fee,
      station.noShowFee,
      station.feeDong,
      0,
    ), 0));

    return {
      reservationId,
      state: 'EXPIRED',
      expired: true,
      shouldCancelReservation: true,
      noShowFeeDong: fee,
      stationCommand: 'CancelReservation',
      stationStatus: 'Available',
      reason: 'NO_SHOW_EXPIRED',
    };
  }

  return {
    reservationId,
    state: status === 'HELD' ? 'HELD' : status || 'HELD',
    expired: false,
    shouldCancelReservation: false,
    noShowFeeDong: 0,
    stationCommand: null,
    stationStatus: null,
    reason: null,
  };
}

function buildNoShowFeeEntry({ reservation = {}, station = {}, feeDong = null, reason = 'NO_SHOW_EXPIRED' } = {}) {
  const summary = evaluateReservationExpiry({ reservation, station, now: new Date() });
  const amount = feeDong !== null && feeDong !== undefined
    ? asNumber(feeDong, 0)
    : summary.noShowFeeDong;

  return {
    reservationId: pickFirst(
      reservation.id,
      reservation.reservationId,
      reservation.reservation_id,
      null,
    ),
    entryType: 'RESERVATION_FEE',
    amountDong: Math.max(0, asNumber(amount, 0)),
    reason,
    requiresWalletDebit: true,
  };
}

module.exports = { evaluateReservationExpiry, buildNoShowFeeEntry };
