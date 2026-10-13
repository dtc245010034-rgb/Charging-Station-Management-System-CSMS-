process.env.CSMS_SKIP_DOTENV = '1';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'z'.repeat(40);
process.env.APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../src/modules/charge-points/charge-points.service');
const repo = require('../../src/modules/charge-points/charge-points.repository');
const audit = require('../../src/modules/audit/audit.repository');

describe('S-16 / S-27 Reset audit failure resilience', () => {
  it('ghi audit lỗi không làm hỏng Reset khi trụ đã nhận lệnh (vẫn trả response của trụ)', async () => {
    const origFindById = repo.findById;
    const origGhiNhatKy = audit.ghi_nhat_ky;

    try {
      repo.findById = async () => ({ id: 10, code: 'CP-RESET-01', station_id: 1 });
      audit.ghi_nhat_ky = async () => {
        throw new Error('Database audit log failed');
      };

      const commandSender = {
        send: async () => ({ status: 'Accepted' }),
      };
      const actor = { id: 1, role: 'ADMIN' };

      const result = await service.reset(actor, 10, 'Soft', commandSender);
      assert.deepEqual(result, { status: 'Accepted' });
    } finally {
      repo.findById = origFindById;
      audit.ghi_nhat_ky = origGhiNhatKy;
    }
  });
});
