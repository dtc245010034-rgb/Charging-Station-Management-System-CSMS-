process.env.CSMS_SKIP_DOTENV = '1';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'z'.repeat(40);
process.env.APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../src/modules/charge-points/charge-points.service');
const repo = require('../../src/modules/charge-points/charge-points.repository');
const audit = require('../../src/modules/audit/audit.repository');
const connections = require('../../src/modules/charge-points/connection-registry');

describe('S-60 / GYM-86 ChangeConfiguration audit and resilience', () => {
  const actor = { id: 1, role: 'ADMIN' };

  it('proceeds with ChangeConfiguration even if GetConfiguration fails', async () => {
    const origFindById = repo.findById;
    const origUpdateHeartbeat = repo.updateHeartbeatInterval;
    const origGhiNhatKy = audit.ghi_nhat_ky;
    const origIsConnected = connections.isConnected;
    let auditEntry = null;

    try {
      repo.findById = async () => ({ id: 10, code: 'CP-CFG-01', station_id: 1 });
      repo.updateHeartbeatInterval = async () => {};
      connections.isConnected = () => true;
      audit.ghi_nhat_ky = async (userId, action, entity, entityId, metadata, result) => {
        auditEntry = { userId, action, entity, entityId, metadata, result };
      };

      const commandSender = {
        send: async (_code, action) => {
          if (action === 'GetConfiguration') {
            throw new Error('GetConfiguration failed or not supported');
          }
          if (action === 'ChangeConfiguration') {
            return { status: 'Accepted' };
          }
          throw new Error(`Unexpected action: ${action}`);
        },
      };

      const result = await service.changeConfiguration(actor, 10, 'HeartbeatInterval', 60, commandSender);
      assert.deepEqual(result, { status: 'Accepted' });
      assert.ok(auditEntry);
      assert.strictEqual(auditEntry.result, 'Accepted');
      assert.strictEqual(auditEntry.metadata.old_value, null);
      assert.strictEqual(auditEntry.metadata.new_value, '60');
    } finally {
      repo.findById = origFindById;
      repo.updateHeartbeatInterval = origUpdateHeartbeat;
      audit.ghi_nhat_ky = origGhiNhatKy;
      connections.isConnected = origIsConnected;
    }
  });

  it('records audit log when charge point times out on ChangeConfiguration', async () => {
    const origFindById = repo.findById;
    const origGhiNhatKy = audit.ghi_nhat_ky;
    const origIsConnected = connections.isConnected;
    let auditEntry = null;

    try {
      repo.findById = async () => ({ id: 10, code: 'CP-CFG-02', station_id: 1 });
      connections.isConnected = () => true;
      audit.ghi_nhat_ky = async (userId, action, entity, entityId, metadata, result) => {
        auditEntry = { userId, action, entity, entityId, metadata, result };
      };

      const commandSender = {
        send: async (_code, action) => {
          if (action === 'GetConfiguration') {
            return { configurationKey: [{ key: 'HeartbeatInterval', value: '30' }] };
          }
          if (action === 'ChangeConfiguration') {
            throw new Error('OCPP call timed out: ChangeConfiguration');
          }
        },
      };

      await assert.rejects(
        () => service.changeConfiguration(actor, 10, 'HeartbeatInterval', 60, commandSender),
        /kịp thời|timed out|Gateway/i
      );

      assert.ok(auditEntry, 'Audit log must be recorded when call times out');
      assert.strictEqual(auditEntry.result, 'TIMEOUT');
      assert.strictEqual(auditEntry.metadata.old_value, '30');
    } finally {
      repo.findById = origFindById;
      audit.ghi_nhat_ky = origGhiNhatKy;
      connections.isConnected = origIsConnected;
    }
  });
});
