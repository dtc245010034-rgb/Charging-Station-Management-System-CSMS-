'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');

const NUL = '\u0000';
const station = (overrides = {}) => ({ name: 'Trạm S4', address: '1 Đường S4', latitude: 21.03, longitude: 105.8, ...overrides });

describe('S4: ký tự NUL (\\u0000) trả 400, không bao giờ 500', { concurrency: false }, () => {
  let admin;
  let owner;
  let driver;
  let stationId;
  let counter = 0;
  const key = () => `S4-KEY-${(counter += 1)}-padding-padding`;
  const as = (user, method, path) => {
    const r = request(app)[method](path);
    if (user) r.set('Cookie', user.cookie);
    return r.set('Idempotency-Key', key());
  };

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('s4-admin@test.invalid', 'ADMIN');
    owner = await createUser('s4-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('s4-driver@test.invalid', 'DRIVER');
    const created = await as(owner, 'post', '/api/stations').send(station());
    assert.equal(created.status, 201, JSON.stringify(created.body));
    stationId = created.body.id;
  });
  after(async () => { await resetSchema(); await closePool(); });

  // [nhãn, hàm gửi]
  const cases = () => [
    ['login.email', () => request(app).post('/api/auth/login').send({ email: `a${NUL}b@test.invalid`, password: 'x' })],
    ['login.password', () => request(app).post('/api/auth/login').send({ email: 's4-driver@test.invalid', password: `a${NUL}b` })],
    ['register.name', () => request(app).post('/api/auth/register').send({ name: `A${NUL}B`, email: 's4-new1@test.invalid', password: 'Mat-khau-dai-12345' })],
    ['register.email', () => request(app).post('/api/auth/register').send({ name: 'A B', email: `s4${NUL}new2@test.invalid`, password: 'Mat-khau-dai-12345' })],
    ['admin.users.name', () => as(admin, 'post', '/api/admin/users').send({ name: `A${NUL}B`, email: 's4-new3@test.invalid', password: 'Mat-khau-dai-12345', role: 'DRIVER' })],
    ['stations.name', () => as(owner, 'post', '/api/stations').send(station({ name: `Trạm${NUL}` }))],
    ['stations.address', () => as(owner, 'post', '/api/stations').send(station({ address: `${NUL}x` }))],
    ['stations.timezone', () => as(owner, 'post', '/api/stations').send(station({ timezone: `Asia/${NUL}` }))],
    ['stations.patch.name', () => as(owner, 'patch', `/api/stations/${stationId}`).send({ name: `Trạm${NUL}` })],
    ['stations.patch.address', () => as(owner, 'patch', `/api/stations/${stationId}`).send({ address: `x${NUL}` })],
    ['stations.search.q', () => as(driver, 'post', '/api/stations/search').send({ lat: 21, lng: 105, q: `a${NUL}b` })],
    ['charge-points.model', () => as(owner, 'post', `/api/stations/${stationId}/charge-points`).send({ code: 'S4-CP-1', model: `M${NUL}`, vendor: 'V' })],
    ['charge-points.vendor', () => as(owner, 'post', `/api/stations/${stationId}/charge-points`).send({ code: 'S4-CP-2', model: 'M', vendor: `V${NUL}` })],
    ['charge-points.code', () => as(owner, 'post', `/api/stations/${stationId}/charge-points`).send({ code: `S4${NUL}CP`, model: 'M', vendor: 'V' })],
    ['plans.name', () => as(admin, 'post', '/api/subscription-plans').send({ code: 'S4_P1', name: `G${NUL}`, priceDong: 1000, periods: [{ from: 0, to: 1440, pricePerKwh: 1, label: 'x' }] })],
    ['plans.label', () => as(admin, 'post', '/api/subscription-plans').send({ code: 'S4_P2', name: 'G', priceDong: 1000, periods: [{ from: 0, to: 1440, pricePerKwh: 1, label: `x${NUL}` }] })],
    ['tariffs.label', () => as(admin, 'post', `/api/stations/${stationId}/tariffs`).send({ effectiveFrom: '2030-01-01', periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3000, label: `x${NUL}` }] })],
    ['wallet.topup.note', () => as(admin, 'post', `/api/admin/wallets/${driver.id}/manual-topups`).send({ amountDong: 1000, receiptCode: 'S4-REC-1', note: `n${NUL}` })],
    ['wallet.topup.receiptCode', () => as(admin, 'post', `/api/admin/wallets/${driver.id}/manual-topups`).send({ amountDong: 1000, receiptCode: `S4${NUL}REC`, note: 'n' })],
    ['wallet.adjust.reason', () => as(admin, 'post', `/api/admin/wallets/${driver.id}/adjustments`).send({ amountDong: 1000, reason: `Điều chỉnh vì lý do ${NUL} dài` })],
    ['wallet.search.query', () => as(admin, 'get', '/api/admin/wallets?query=%00')],
    ['audit-logs.user', () => as(admin, 'get', '/api/audit-logs?user=a%00b')],
    ['audit-logs.charge_point', () => as(admin, 'get', '/api/audit-logs?charge_point=a%00b')],
    ['admin.users.query', () => as(admin, 'get', '/api/admin/users?query=a%00b')],
    ['path.stationId', () => as(admin, 'get', '/api/stations/%00')],
    ['path.stationId.suffix', () => as(admin, 'get', `/api/stations/${stationId}%00`)],
  ];

  it('mọi trường chuỗi chính chứa NUL (body, query, đường dẫn) trả 4xx, không có 5xx', async () => {
    const failures = [];
    for (const [label, send] of cases()) {
      const res = await send();
      if (res.status >= 500) failures.push(`${label} -> ${res.status} ${res.body?.error?.code}`);
      else if (res.status < 400) failures.push(`${label} -> ${res.status} (đã được nhận!)`);
    }
    assert.deepEqual(failures, []);
  });

  it('NUL ở body/query trả đúng 400 với thông điệp tiếng Việt', async () => {
    for (const [label, send] of cases().filter(([name]) => /^(login\.email|register\.|stations\.|plans\.|admin\.users|audit-logs|wallet\.)/.test(name))) {
      const res = await send();
      assert.equal(res.status, 400, `${label}: ${res.status} ${JSON.stringify(res.body)}`);
      assert.match(res.body.error.message, /[\p{L}]/u, label);
    }
  });

  it('NUL lồng sâu trong mảng/đối tượng và khoá đối tượng cũng bị chặn', async () => {
    const deep = await as(admin, 'post', '/api/subscription-plans').send({ code: 'S4_P3', name: 'G', priceDong: 1000, periods: [{ from: 0, to: 1440, pricePerKwh: 1, label: 'x', extra: { a: [`y${NUL}`] } }] });
    assert.equal(deep.status, 400);
    const key2 = await as(owner, 'post', '/api/stations').send(station({ [`k${NUL}`]: 1 }));
    assert.equal(key2.status, 400);
  });

  it('ký tự điều khiển \\u0001–\\u001f không gây 500; chuỗi rất dài bị từ chối bằng 4xx', async () => {
    for (let code = 1; code <= 0x1f; code += 1) {
      const res = await as(owner, 'post', '/api/stations').send(station({ name: `Trạm ${String.fromCharCode(code)} X` }));
      assert.ok(res.status < 500, `\\u${code.toString(16).padStart(4, '0')} -> ${res.status}`);
    }
    const long = await as(owner, 'post', '/api/stations').send(station({ name: 'A'.repeat(200000) }));
    assert.ok(long.status >= 400 && long.status < 500, `chuỗi 200k ký tự -> ${long.status}`);
  });

  it('tên tiếng Việt hợp lệ (dựng sẵn NFC và tổ hợp NFD, emoji) được lưu nguyên văn, không bị hỏng', async () => {
    const nfc = 'Trạm sạc Nguyễn Văn Cừ ⚡';
    const nfd = nfc.normalize('NFD');
    assert.notEqual(nfc, nfd);
    for (const name of [nfc, nfd]) {
      const res = await as(owner, 'post', '/api/stations').send(station({ name }));
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const stored = (await query('SELECT name FROM stations WHERE id = $1', [res.body.id])).rows[0].name;
      assert.equal(stored, name);
    }
  });

  it('không dữ liệu nào chứa NUL được ghi vào DB bởi các yêu cầu bị từ chối', async () => {
    assert.equal((await query("SELECT count(*)::int n FROM users WHERE email LIKE 's4-new%'")).rows[0].n, 0);
  });
});

describe('S4: lưới an toàn ở error handler cho lỗi PostgreSQL ký tự không hợp lệ', () => {
  const { errorHandler } = require('../../src/middlewares/errorHandler');
  const fire = (err) => {
    let out;
    errorHandler(err, {}, { headersSent: false, set() {}, status(code) { out = { code }; return { json(body) { out.body = body; } }; } }, () => {});
    return out;
  };

  for (const pgCode of ['22021', '22P05']) {
    it(`mã pg ${pgCode} -> 400 BAD_REQUEST (không phải 500)`, () => {
      const out = fire(Object.assign(new Error('invalid byte sequence for encoding "UTF8": 0x00'), { code: pgCode }));
      assert.equal(out.code, 400);
      assert.equal(out.body.error.code, 'BAD_REQUEST');
      assert.match(out.body.error.message, /ký tự/);
    });
  }
});
