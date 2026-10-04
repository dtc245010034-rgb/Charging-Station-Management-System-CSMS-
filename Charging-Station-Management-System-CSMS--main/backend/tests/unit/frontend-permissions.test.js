const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const backend = require('../../src/security/permissions');

// Bảng quyền ở frontend chỉ để ẩn/hiện nút; nó phải khớp bảng quyền thật của backend.
describe('frontend/app/permissions.js khớp backend/src/security/permissions.js', () => {
  it('cùng khoá và cùng danh sách vai trò cho mọi quyền không public', async () => {
    const { PERMISSIONS } = await import(pathToFileURL(path.resolve(__dirname, '../../../frontend/app/permissions.js')).href);
    const server = Object.fromEntries(Object.entries(backend.permissions).filter(([, roles]) => Array.isArray(roles)));
    assert.deepStrictEqual(Object.keys(PERMISSIONS).sort(), Object.keys(server).sort());
    for (const [key, roles] of Object.entries(server)) assert.deepStrictEqual([...PERMISSIONS[key]].sort(), [...roles].sort(), key);
  });
});
