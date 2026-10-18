'use strict';

const { OcppCommandError } = require('../ocpp/commands');
const { OcppRemoteCallError } = require('../ocpp/message-handler');

function buildChargingProfilePayload(profile) {
  return {
    connectorId: profile.connector_no,
    csChargingProfiles: {
      chargingProfileId: profile.connector_no,
      transactionId: Number(profile.transaction_id),
      stackLevel: 1,
      chargingProfilePurpose: 'TxProfile',
      chargingProfileKind: 'Relative',
      chargingSchedule: {
        chargingRateUnit: 'W',
        chargingSchedulePeriod: [{ startPeriod: 0, limit: profile.limit_w }],
      },
    },
  };
}

function commandFailure(error) {
  if (error instanceof OcppCommandError && error.code === 'OFFLINE') {
    return { status: 'OFFLINE', reason: error.message };
  }
  if (/^(OCPP connection closed|Failed to send OCPP call:)/.test(error?.message || '')) {
    return { status: 'OFFLINE', reason: error.message };
  }
  if (error instanceof OcppRemoteCallError || error?.name === 'OcppRemoteCallError') {
    const status = error.code === 'NotSupported' ? 'NOT_SUPPORTED' : 'REJECTED';
    return { status, reason: `${error.code}: ${error.message}` };
  }
  if (/^OCPP call timed out:/.test(error?.message || '')) {
    return { status: 'TIMEOUT', reason: error.message };
  }
  throw error;
}

module.exports = { buildChargingProfilePayload, commandFailure };
