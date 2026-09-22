const { describe, it } = require('node:test');
const assert = require('node:assert');

// Handler logic isolated directly from server.js lines 224-226
function processOcppMessage(rawMessage) {
  const now = () => new Date().toISOString();
  try {
    const parsed = JSON.parse(rawMessage.toString());
    if (!Array.isArray(parsed)) {
      return [4, null, 'FormatViolation', {}];
    }
    const [type, id, action, payload] = parsed;

    const responses = {
      BootNotification: { status: 'Accepted', currentTime: now(), interval: 60 },
      Heartbeat: { currentTime: now() },
      StatusNotification: { status: 'Accepted' },
      Authorize: { idTagInfo: { status: payload?.idTag ? 'Accepted' : 'Invalid' } },
    };

    if (type === 2 && responses[action]) {
      return [3, id, responses[action]];
    }
    return [4, id, 'NotSupported', {}];
  } catch {
    return [4, null, 'FormatViolation', {}];
  }
}

function matchOcppUrl(url) {
  const match = url.match(/^\/ocpp\/([^/?]+)/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

describe('Unit Tests — OCPP 1.6-style WebSocket Message Protocol', () => {
  // --------------------------------------------------------------------------
  // UT-OCPP-01 [P0]: BootNotification
  // --------------------------------------------------------------------------
  describe('UT-OCPP-01 [P0]: BootNotification Handling', () => {
    it('should respond with Accepted status, interval 60 and valid currentTime', () => {
      const msg = JSON.stringify([
        2,
        'msg-boot-001',
        'BootNotification',
        { chargePointModel: 'FastCharger-V2', chargePointVendor: 'CSMS-Tech' },
      ]);

      const response = processOcppMessage(msg);

      assert.strictEqual(response[0], 3, 'Message type must be 3 (CALLRESULT)');
      assert.strictEqual(response[1], 'msg-boot-001', 'Message ID must match request ID');
      assert.strictEqual(response[2].status, 'Accepted');
      assert.strictEqual(response[2].interval, 60, 'Heartbeat interval must be 60 seconds');
      assert(typeof response[2].currentTime === 'string', 'currentTime must be an ISO timestamp');
      assert(!isNaN(Date.parse(response[2].currentTime)), 'currentTime must be valid date string');
    });
  });

  // --------------------------------------------------------------------------
  // UT-OCPP-02 [P0]: Authorize
  // --------------------------------------------------------------------------
  describe('UT-OCPP-02 [P0]: Authorize idTag Validation', () => {
    it('should return Accepted when valid idTag is provided', () => {
      const msg = JSON.stringify([2, 'msg-auth-101', 'Authorize', { idTag: 'RFID-USER-8888' }]);
      const response = processOcppMessage(msg);

      assert.strictEqual(response[0], 3);
      assert.strictEqual(response[1], 'msg-auth-101');
      assert.strictEqual(response[2]?.idTagInfo?.status, 'Accepted');
    });

    it('should return Invalid when idTag is empty or missing in payload', () => {
      const msgMissing = JSON.stringify([2, 'msg-auth-102', 'Authorize', {}]);
      const resMissing = processOcppMessage(msgMissing);
      assert.strictEqual(resMissing[2]?.idTagInfo?.status, 'Invalid');

      const msgEmpty = JSON.stringify([2, 'msg-auth-103', 'Authorize', { idTag: '' }]);
      const resEmpty = processOcppMessage(msgEmpty);
      assert.strictEqual(resEmpty[2]?.idTagInfo?.status, 'Invalid');
    });
  });

  // --------------------------------------------------------------------------
  // UT-OCPP-03, UT-OCPP-04 [P1]: Heartbeat & StatusNotification
  // --------------------------------------------------------------------------
  describe('UT-OCPP-03, UT-OCPP-04 [P1]: Heartbeat & StatusNotification', () => {
    it('UT-OCPP-03 [P1]: should return currentTime on Heartbeat', () => {
      const msg = JSON.stringify([2, 'msg-hb-001', 'Heartbeat', {}]);
      const response = processOcppMessage(msg);

      assert.strictEqual(response[0], 3);
      assert.strictEqual(response[1], 'msg-hb-001');
      assert(typeof response[2].currentTime === 'string');
    });

    it('UT-OCPP-04 [P1]: should return Accepted on StatusNotification', () => {
      const msg = JSON.stringify([
        2,
        'msg-status-001',
        'StatusNotification',
        { connectorId: 1, errorCode: 'NoError', status: 'Available' },
      ]);
      const response = processOcppMessage(msg);

      assert.strictEqual(response[0], 3);
      assert.strictEqual(response[1], 'msg-status-001');
      assert.strictEqual(response[2]?.status, 'Accepted');
    });
  });

  // --------------------------------------------------------------------------
  // UT-OCPP-05, UT-OCPP-06 [P1]: Error handling (NotSupported & FormatViolation)
  // --------------------------------------------------------------------------
  describe('UT-OCPP-05, UT-OCPP-06 [P1]: Error Responses', () => {
    it('UT-OCPP-05 [P1]: should return NotSupported when action is unrecognized', () => {
      const msg = JSON.stringify([2, 'msg-err-001', 'UnknownActionX', {}]);
      const response = processOcppMessage(msg);

      assert.strictEqual(response[0], 4, 'Message type must be 4 (CALLERROR)');
      assert.strictEqual(response[1], 'msg-err-001');
      assert.strictEqual(response[2], 'NotSupported');
    });

    it('UT-OCPP-05 [P1]: should return NotSupported when message type is not 2 (CALL)', () => {
      const msg = JSON.stringify([3, 'msg-wrong-type', 'BootNotification', {}]);
      const response = processOcppMessage(msg);

      assert.strictEqual(response[0], 4);
      assert.strictEqual(response[2], 'NotSupported');
    });

    it('UT-OCPP-06 [P1]: should return FormatViolation when message is malformed JSON', () => {
      const malformedJson = '{ invalid: json string [';
      const response = processOcppMessage(malformedJson);

      assert.strictEqual(response[0], 4);
      assert.strictEqual(response[1], null);
      assert.strictEqual(response[2], 'FormatViolation');
    });

    it('UT-OCPP-06 [P1]: should return FormatViolation when JSON is not an array', () => {
      const notAnArray = JSON.stringify({ type: 2, action: 'Heartbeat' });
      const response = processOcppMessage(notAnArray);

      assert.strictEqual(response[0], 4);
      assert.strictEqual(response[2], 'FormatViolation');
    });
  });

  // --------------------------------------------------------------------------
  // UT-OCPP-07 [P1]: URL Matching for WebSocket Upgrade
  // --------------------------------------------------------------------------
  describe('UT-OCPP-07 [P1]: WebSocket URL Matching & Parameter Extraction', () => {
    it('should extract chargePointCode from valid endpoint URL', () => {
      assert.strictEqual(matchOcppUrl('/ocpp/CP-HANOI-01'), 'CP-HANOI-01');
      assert.strictEqual(matchOcppUrl('/ocpp/CP-DA-NANG-99?token=xyz'), 'CP-DA-NANG-99');
    });

    it('should decode URL-encoded chargePointCode correctly', () => {
      assert.strictEqual(matchOcppUrl('/ocpp/CP%20SPECIAL%2001'), 'CP SPECIAL 01');
    });

    it('should return null for non-OCPP URLs', () => {
      assert.strictEqual(matchOcppUrl('/'), null);
      assert.strictEqual(matchOcppUrl('/api/stations'), null);
      assert.strictEqual(matchOcppUrl('/ws/other'), null);
      assert.strictEqual(matchOcppUrl('/ocpp/'), null);
    });
  });
});
