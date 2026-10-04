const { describe, it } = require('node:test');
const assert = require('node:assert');
const connections = require('../../src/modules/charge-points/connection-registry');

describe('OCPP connection registry', () => {
  it('replaces the existing connection for a normalized charge point code', () => {
    const first = { closeCalls: 0, close() { this.closeCalls += 1; } };
    const second = { closeCalls: 0, close() { this.closeCalls += 1; } };

    connections.connect('CP-ONLINE', first);
    connections.connect('cp-online', second);

    assert.strictEqual(connections.isConnected('CP-ONLINE'), true);
    assert.strictEqual(first.closeCalls, 1);
    assert.strictEqual(connections.getConnection('CP-ONLINE'), second);

    connections.disconnect('CP-ONLINE', first);
    assert.strictEqual(connections.getConnection('CP-ONLINE'), second);

    connections.disconnect('CP-ONLINE', second);
    assert.strictEqual(connections.isConnected('CP-ONLINE'), false);
  });
});