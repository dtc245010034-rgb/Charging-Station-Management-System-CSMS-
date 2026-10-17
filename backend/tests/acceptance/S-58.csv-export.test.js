const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { resetSchema, run } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { csvCell } = require('../../src/modules/reports/csv');

describe('S-58 AC: revenue and reconciliation CSV exports', () => {
  let admin;

  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.equal(migrated.status, 0, migrated.stderr);
    admin = await createUser('s58-admin@test.invalid', 'ADMIN');
  });

  after(async () => {
    await resetSchema();
    await closePool();
  });

  it('trả CSV UTF-8 có BOM, header và delimiter đã chọn cho hai báo cáo', async () => {
    for (const [path, delimiter] of [
      ['/api/reports/revenue.csv?from=2026-09-01&to=2026-09-30&delimiter=semicolon', ';'],
      ['/api/reports/reconciliation.csv?from=2026-09-01&to=2026-09-30&delimiter=comma', ','],
    ]) {
      const response = await request(app).get(path).set('Cookie', admin.cookie);
      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /text\/csv; charset=utf-8/i);
      assert.match(response.headers['content-disposition'], /attachment; filename=/i);
      assert.equal(response.text.charCodeAt(0), 0xFEFF);
      assert.ok(response.text.split(/\r?\n/)[0].includes(delimiter));
    }
  });

  it('từ chối delimiter không hỗ trợ', async () => {
    const response = await request(app)
      .get('/api/reports/revenue.csv?from=2026-09-01&to=2026-09-30&delimiter=tab')
      .set('Cookie', admin.cookie);

    assert.equal(response.status, 400);
  });

  it('quote delimiter/nháy, giữ nguyên số âm và trung hoà chuỗi công thức', () => {
    assert.equal(csvCell('=1+1'), "'=1+1");
    assert.equal(csvCell('+cmd'), "'+cmd");
    assert.equal(csvCell('-cmd'), "'-cmd");
    assert.equal(csvCell(-1), '-1');
    assert.equal(csvCell('@name'), "'@name");
    assert.equal(csvCell('a;b', ';'), '"a;b"');
    assert.equal(csvCell('a"b'), '"a""b"');
  });
});
