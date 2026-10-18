process.env.DATABASE_URL ||= process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET ||= 'test-jwt-secret-with-at-least-32-characters';
process.env.APP_ORIGIN ||= 'http://localhost:3000';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const repo = require('../../src/modules/stations/stations.repository');
const audit = require('../../src/modules/audit/audit.repository');
const service = require('../../src/modules/stations/stations.service');

describe('stations service power rebalance trigger [GYM-68]', () => {
  const actor = { id: 1, role: 'admin' };

  it('triggers rebalance when station power_limit_w is updated', async () => {
    const origFindById = repo.findById;
    const origUpdate = repo.update;
    const origAudit = audit.record;
    let rebalancedStationId = null;
    let rebalanceReason = null;

    try {
      repo.findById = async () => ({ id: 10, status: 'ACTIVE', power_limit_w: 15000, rated_total_w: 15000 });
      repo.update = async () => {};
      audit.record = async () => {};

      await service.update(actor, 10, { power_limit_w: 15000 }, {
        rebalanceStation: (id, { reason }) => {
          rebalancedStationId = id;
          rebalanceReason = reason;
        },
      });

      assert.strictEqual(rebalancedStationId, 10);
      assert.strictEqual(rebalanceReason, 'UPDATE_STATION_LIMIT');
    } finally {
      repo.findById = origFindById;
      repo.update = origUpdate;
      audit.record = origAudit;
    }
  });

  it('does not trigger rebalance when only station name/address is updated', async () => {
    const origFindById = repo.findById;
    const origUpdate = repo.update;
    const origAudit = audit.record;
    let rebalanced = false;

    try {
      repo.findById = async () => ({ id: 10, status: 'ACTIVE', name: 'New Name', power_limit_w: null, rated_total_w: 0 });
      repo.update = async () => {};
      audit.record = async () => {};

      await service.update(actor, 10, { name: 'New Name' }, {
        rebalanceStation: () => {
          rebalanced = true;
        },
      });

      assert.strictEqual(rebalanced, false);
    } finally {
      repo.findById = origFindById;
      repo.update = origUpdate;
      audit.record = origAudit;
    }
  });

  it('triggers rebalance when connector power is updated', async () => {
    const origConnectorById = repo.connectorById;
    const origUpdateConnectorPower = repo.updateConnectorPower;
    const origAudit = audit.record;
    let rebalancedStationId = null;
    let rebalanceReason = null;

    try {
      repo.connectorById = async () => ({
        id: 5,
        station_id: 10,
        charge_point_id: 2,
        charge_point_code: 'CP-01',
        effective_power_w: 7400,
      });
      repo.updateConnectorPower = async () => {};
      audit.record = async () => {};

      await service.setConnectorPower(actor, 5, 7400, {
        rebalanceStation: (id, { reason }) => {
          rebalancedStationId = id;
          rebalanceReason = reason;
        },
      });

      assert.strictEqual(rebalancedStationId, 10);
      assert.strictEqual(rebalanceReason, 'UPDATE_CONNECTOR_POWER');
    } finally {
      repo.connectorById = origConnectorById;
      repo.updateConnectorPower = origUpdateConnectorPower;
      audit.record = origAudit;
    }
  });
});
