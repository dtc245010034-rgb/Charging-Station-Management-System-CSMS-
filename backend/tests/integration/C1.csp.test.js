const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');

const parse = (header) => Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
  const [name, ...values] = part.split(/\s+/);
  return [name, values];
}));

describe('C1 (chiều sâu): Content-Security-Policy cho giao diện tĩnh', () => {
  after(closePool);

  for (const page of ['/index.html', '/app.html', '/']) {
    it(`${page} có CSP chặn script nội tuyến/eval và chỉ cho tile bản đồ từ OpenStreetMap`, async () => {
      const res = await request(app).get(page);
      assert.equal(res.status, 200);
      const csp = parse(res.headers['content-security-policy'] ?? '');
      assert.deepEqual(csp['default-src'], ["'self'"]);
      assert.deepEqual(csp['script-src'], ["'self'"], 'script-src không được có unsafe-inline/unsafe-eval');
      assert.deepEqual(csp['object-src'], ["'none'"]);
      assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
      assert.deepEqual(csp['base-uri'], ["'self'"]);
      assert.ok(csp['img-src'].includes('https://*.tile.openstreetmap.org'));
      assert.ok(!Object.values(csp).flat().includes("'unsafe-eval'"));
      assert.ok(!(csp['style-src'] ?? []).includes("'unsafe-inline'"), 'style-src (thẻ <style>) không cho phép inline; chỉ thuộc tính style qua style-src-attr');
    });
  }

  it('tệp JS/CSS tĩnh cũng mang CSP; phản hồi API JSON không bị ảnh hưởng', async () => {
    assert.ok((await request(app).get('/main.js')).headers['content-security-policy']);
    const api = await request(app).get('/api/health');
    assert.equal(api.headers['content-type'].startsWith('application/json'), true);
    assert.equal(api.headers['content-security-policy'], undefined, 'CSP chỉ áp cho giao diện tĩnh');
  });
});
