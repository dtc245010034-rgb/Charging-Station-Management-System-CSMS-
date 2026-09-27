const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createBody: createStation } = require('../../src/modules/stations/stations.schema');
const { createBody: createChargePoint } = require('../../src/modules/charge-points/charge-points.schema');

describe('S-04/S-05 input validation', () => {
  it('accepts coordinates at their geographic limits and defaults new stations inactive', () => {
    const result = createStation.parse({ name: 'A', address: 'B', latitude: 90, longitude: '-180' });
    assert.strictEqual(result.status, 'INACTIVE');
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

  it('allows legacy requests without coordinates and limits connectors to one through four', () => {
    assert.strictEqual(createStation.parse({ name: 'A', address: 'B' }).status, 'INACTIVE');
    assert.strictEqual(createChargePoint.parse({ code: 'CP-1' }).connector_count, 4);
    assert.strictEqual(createChargePoint.safeParse({ code: 'CP-2', connector_count: 5 }).success, false);
  });

  it('trims whitespace and normalizes OCPP-style codes and station status', () => {
    const station = createStation.parse({ name: '   Trạm A   ', address: '   Hà Nội   ', status: ' active ' });
    const cp = createChargePoint.parse({ code: '  cp-n1  ' });

    assert.strictEqual(station.name, 'Trạm A');
    assert.strictEqual(station.address, 'Hà Nội');
    assert.strictEqual(station.status, 'ACTIVE');
    assert.strictEqual(cp.code, 'CP-N1');
    assert.strictEqual(createStation.safeParse({ name: '   ', address: 'A' }).success, false);
    assert.strictEqual(createChargePoint.safeParse({ code: '   ' }).success, false);
  });
});