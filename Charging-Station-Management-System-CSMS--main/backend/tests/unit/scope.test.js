const { describe, it } = require('node:test');
const assert = require('node:assert');
const { scopeByOwner } = require('../../src/db/scope');
const { ForbiddenError } = require('../../src/lib/errors');

describe('scopeByOwner: một hàm duy nhất áp điều kiện sở hữu', () => {
  it('STATION_OWNER → lọc theo owner_id của actor', () => {
    assert.deepStrictEqual(scopeByOwner({ id: '7', roles: ['STATION_OWNER'] }, 's'), { sql: 's.owner_id = ?', params: ['7'] });
  });

  it('ADMIN và OPERATOR → không lọc', () => {
    for (const role of ['ADMIN', 'OPERATOR']) {
      assert.deepStrictEqual(scopeByOwner({ id: '1', roles: [role] }, 's'), { sql: 'TRUE', params: [] });
    }
  });

  it('vai trò khác hoặc không có vai trò → ForbiddenError', () => {
    for (const roles of [['DRIVER'], ['ACCOUNTANT'], []]) {
      assert.throws(() => scopeByOwner({ id: '1', roles }, 's'), ForbiddenError);
    }
  });

  it('alias không hợp lệ → ném lỗi (chặn chèn SQL qua alias)', () => {
    assert.throws(() => scopeByOwner({ id: '1', roles: ['ADMIN'] }, 's; DROP TABLE users'));
  });
});
