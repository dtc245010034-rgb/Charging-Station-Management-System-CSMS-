'use strict';

const PROFILE_RESULTS = Object.freeze(['Accepted', 'Rejected', 'NotSupported']);
const METER_PERIOD_SECONDS = 10;
const NOMINAL_POWER_W = 7200;

function profileResult(value = 'Accepted') {
  if (!PROFILE_RESULTS.includes(value)) {
    throw new Error(`profile result must be one of: ${PROFILE_RESULTS.join(', ')}`);
  }
  return value;
}

function resolveSetChargingProfile(payload, configuredResult = 'Accepted') {
  const status = profileResult(configuredResult);
  if (status !== 'Accepted' || !isSupportedProfile(payload)) {
    return { status: status === 'Accepted' ? 'Rejected' : status, profile: null };
  }
  return { status, profile: payload };
}

function isSupportedProfile(payload) {
  const profile = payload?.csChargingProfiles;
  const periods = profile?.chargingSchedule?.chargingSchedulePeriod;
  return Number.isSafeInteger(payload?.connectorId)
    && payload.connectorId > 0
    && Number.isSafeInteger(profile?.transactionId)
    && profile.chargingProfilePurpose === 'TxProfile'
    && profile.chargingProfileKind === 'Absolute'
    && profile.chargingSchedule?.chargingRateUnit === 'W'
    && Array.isArray(periods)
    && periods.some((period) => period?.startPeriod === 0
      && Number.isFinite(period.limit)
      && period.limit >= 0);
}

function profileLimitW(profile, connectorId, transactionId) {
  const requested = profile?.csChargingProfiles;
  if (!profile || profile.connectorId !== connectorId || requested?.transactionId !== transactionId) return null;
  const period = requested.chargingSchedule?.chargingSchedulePeriod?.find((item) => item.startPeriod === 0);
  return period && Number.isFinite(period.limit) && period.limit >= 0 ? Math.floor(period.limit) : null;
}

function meterReading(meterWh, limitW) {
  const powerW = Math.min(NOMINAL_POWER_W, limitW ?? NOMINAL_POWER_W);
  return {
    meterWh: meterWh + Math.floor((powerW * METER_PERIOD_SECONDS) / 3600),
    powerW,
  };
}

module.exports = {
  PROFILE_RESULTS,
  profileResult,
  resolveSetChargingProfile,
  profileLimitW,
  meterReading,
};
