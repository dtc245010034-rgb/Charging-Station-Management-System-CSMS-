const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { alertsQuery } = require('../../src/modules/alerts/alerts.schema');

describe('alerts schema', () => {
  it('defaults state to open when omitted', () => {
    const parsed = alertsQuery.parse({});
    assert.strictEqual(parsed.state, 'open');
  });

  it('accepts valid state values', () => {
    assert.strictEqual(alertsQuery.parse({ state: 'open' }).state, 'open');
    assert.strictEqual(alertsQuery.parse({ state: 'closed' }).state, 'closed');
  });

  it('rejects invalid state values', () => {
    assert.throws(() => alertsQuery.parse({ state: 'pending' }));
  });
});
