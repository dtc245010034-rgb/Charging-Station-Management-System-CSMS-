const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createBody: createStation } = require('../../src/modules/stations/stations.schema');
const { createBody: createChargePoint } = require('../../src/modules/charge-points/charge-points.schema');

describe('S-04/S-05 input validation', () => {
  it('accepts coordinates at their geographic limits without accepting client-selected status', () => {
    const result = createStation.parse({ name: 'A', address: 'B', latitude: 90, longitude: '-180' });
    assert.strictEqual(result.status, undefined);
  });

  it('rejects out-of-range coordinates and incomplete coordinate pairs', () => {
    assert.strictEqual(createStation.safeParse({ name: 'A', address: 'B', latitude: 95, longitude: 20 }).success, false);
    assert.strictEqual(createStation.safeParse({ name: 'A', address: 'B', latitude: 20 }).success, false);
  });

  it('requires both coordinates when a partial station update changes location', () => {
    const { updateBody } = require('../../src/modules/stations/stations.schema');
    assert.strictEqual(updateBody.safeParse({ latitude: 21 }).success, false);
    assert.strictEqual(updateBody.safeParse({ latitude: null, longitude: null }).success, true);
  });

  it('requires coordinates and limits connectors to one through four', () => {
    assert.strictEqual(createStation.safeParse({ name: 'A', address: 'B' }).success, false);
    assert.strictEqual(createChargePoint.parse({ code: 'CP-1' }).connector_count, 4);
    assert.strictEqual(createChargePoint.safeParse({ code: 'CP-2', connector_count: 5 }).success, false);
  });

  it('rejects client-supplied owner and status fields in station creation', () => {
    const body = { name: 'A', address: 'B', latitude: 21, longitude: 105 };
    assert.strictEqual(createStation.safeParse({ ...body, owner_id: 999 }).success, false);
    assert.strictEqual(createStation.safeParse({ ...body, status: 'ACTIVE' }).success, false);
  });

  it('allows status in the shared update contract for service-level role enforcement', () => {
    const { updateBody } = require('../../src/modules/stations/stations.schema');
    assert.strictEqual(updateBody.parse({ status: 'ACTIVE' }).status, 'ACTIVE');
    assert.strictEqual(updateBody.safeParse({ owner_id: 999 }).success, false);
  });
});