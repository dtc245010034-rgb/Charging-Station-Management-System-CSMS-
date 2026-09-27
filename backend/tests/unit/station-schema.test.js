const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createBody: createStation } = require('../../src/modules/stations/stations.schema');
const { createBody: createChargePoint } = require('../../src/modules/charge-points/charge-points.schema');

describe('S-04/S-05 input validation', () => {
  it('accepts coordinates at their geographic limits and rejects any status on create', () => {
    assert.strictEqual(createStation.safeParse({ name: 'A', address: 'B', latitude: 90, longitude: '-180' }).success, true);
    assert.strictEqual(createStation.safeParse({ name: 'A', address: 'B', latitude: 1, longitude: 1, status: 'ACTIVE' }).success, false);
  });

  it('rejects out-of-range coordinates and incomplete coordinate pairs', () => {
    assert.strictEqual(createStation.safeParse({ name: 'A', address: 'B', latitude: 95, longitude: 20 }).success, false);
    assert.strictEqual(createStation.safeParse({ name: 'A', address: 'B', latitude: 20 }).success, false);
  });

  it('requires coordinates and rejects blank name or address on create', () => {
    assert.strictEqual(createStation.safeParse({ name: 'A', address: 'B' }).success, false);
    assert.strictEqual(createStation.safeParse({ name: ' ', address: 'B', latitude: 1, longitude: 1 }).success, false);
    assert.strictEqual(createStation.safeParse({ name: 'A', address: '  ', latitude: 1, longitude: 1 }).success, false);
  });

  it('requires both coordinates when a partial station update changes location', () => {
    const { updateBody } = require('../../src/modules/stations/stations.schema');
    assert.strictEqual(updateBody.safeParse({ latitude: 21 }).success, false);
    assert.strictEqual(updateBody.safeParse({ latitude: null, longitude: null }).success, false);
    assert.strictEqual(updateBody.safeParse({ name: '  ' }).success, false);
  });

  it('limits connectors to one through four', () => {
    assert.strictEqual(createChargePoint.parse({ code: 'CP-1' }).connector_count, 4);
    assert.strictEqual(createChargePoint.safeParse({ code: 'CP-2', connector_count: 5 }).success, false);
  });
});