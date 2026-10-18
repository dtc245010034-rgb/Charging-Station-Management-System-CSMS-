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
    for (const [path, delimiter, expectedFilename, expectedHeader] of [
      ['/api/reports/revenue.csv?from=2026-09-01&to=2026-09-30&delimiter=semicolon', ';', 'doanh-thu_2026-09-01_2026-09-30.csv', 'Trạm'],
      ['/api/reports/reconciliation.csv?from=2026-09-01&to=2026-09-30&delimiter=comma', ',', 'doi-soat_2026-09-01_2026-09-30.csv', 'Mã phiên'],
    ]) {
      const response = await request(app).get(path).set('Cookie', admin.cookie);
      assert.equal(response.status, 200);
      assert.match(response.headers['content-type'], /text\/csv; charset=utf-8/i);
      assert.match(response.headers['content-disposition'], new RegExp(expectedFilename, 'i'));
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.text.charCodeAt(0), 0xFEFF);
      const lines = response.text.trim().split(/\r?\n/);
      assert.ok(lines[0].includes(delimiter));
      assert.ok(lines[0].includes(expectedHeader));
      // Dòng cuối cùng là dòng TỔNG
      assert.ok(lines[lines.length - 1].includes('TỔNG'));
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
    assert.equal(csvCell(-12000), '-12000');
    assert.equal(csvCell('@name'), "'@name");
    assert.equal(csvCell('\t=cmd'), "'\t=cmd");
    assert.equal(csvCell('\r=cmd'), '"\'\r=cmd"');
    assert.equal(csvCell('a;b', ';'), '"a;b"');
    assert.equal(csvCell('a"b'), '"a""b"');
  });
});
