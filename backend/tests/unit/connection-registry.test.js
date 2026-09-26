const { describe, it } = require('node:test');
const assert = require('node:assert');
const connections = require('../../src/modules/charge-points/connection-registry');

describe('OCPP connection registry', () => {
  it('tracks multiple active connections per charge point code', () => {
    connections.connect('CP-ONLINE');
    connections.connect('cp-online');
    assert.strictEqual(connections.isConnected('CP-ONLINE'), true);
    connections.disconnect('CP-ONLINE');
    assert.strictEqual(connections.isConnected('CP-ONLINE'), true);
    connections.disconnect('CP-ONLINE');
    assert.strictEqual(connections.isConnected('CP-ONLINE'), false);
  });
});