const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, connectChargePoint, bootChargePoint } = require('../helpers/server-process');

const plan = (code, overrides = {}) => ({
  code, name: 'Gói F', priceDong: 100000, durationDays: 30,
  periods: [{ from: '00:00', to: '24:00', pricePerKwh: 3000, label: 'Đồng giá' }], ...overrides,
});

describe('Phát hiện thêm (lần 37): các lỗi nhỏ đã sửa', { concurrency: false }, () => {
  let admin;
  let owner;
  let stationId;
  let server;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('f-admin@test.invalid', 'ADMIN');
    owner = await createUser('f-owner@test.invalid', 'STATION_OWNER');
    stationId = (await postStation(owner, stationBody({ name: 'Station F' }))).body.id;
    const cp = await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, 'F-NUL-CP-1', 'UNKNOWN') RETURNING id", [stationId]);
    await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1)', [cp.rows[0].id]);
  });
  after(async () => {
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  const createPlan = (body, key) => {
    const r = request(app).post('/api/subscription-plans').set('Cookie', admin.cookie);
    if (key) r.set('Idempotency-Key', key);
    return r.send(body);
  };

  it('phản hồi tạo gói có khung giờ đúng (00:00–24:00), không phải NaN:NaN', async () => {
    const res = await createPlan(plan('F_PERIODS'), 'F-KEY-PERIODS-0001');
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(res.body.periods, [{ startMinute: 0, endMinute: 1440, from: '00:00', to: '24:00', pricePerKwh: '3000', label: 'Đồng giá' }]);
    const listed = (await request(app).get('/api/subscription-plans').set('Cookie', admin.cookie)).body.find((p) => p.code === 'F_PERIODS');
    assert.deepEqual(listed.periods, res.body.periods, 'phản hồi tạo phải khớp danh sách');
  });

  it('khung công suất sai limitKw trả thông điệp tiếng Việt', async () => {
    for (const limitKw of [undefined, 'abc', -1, 0]) {
      const res = await request(app).post(`/api/stations/${stationId}/power-windows`).set('Cookie', owner.cookie)
        .send({ startTime: '10:00', endTime: '11:00', limitKw });
      assert.equal(res.status, 400);
      assert.ok(!/invalid|expected|received/i.test(res.body.error.message), `limitKw=${limitKw}: ${res.body.error.message}`);
      assert.match(res.body.error.message, /công suất|kW/i);
    }
  });

  describe('POST /api/subscription-plans cần Idempotency-Key', () => {
    it('thiếu hoặc sai định dạng khoá trả 400 và không tạo gói', async () => {
      for (const key of [undefined, 'ngan', 'co dau cach!']) {
        const res = await createPlan(plan('F_NOKEY'), key);
        assert.equal(res.status, 400, `key=${key}`);
        assert.match(res.body.error.message, /Idempotency-Key/);
      }
      assert.equal((await query("SELECT count(*)::int n FROM subscription_plans WHERE code = 'F_NOKEY'")).rows[0].n, 0);
    });

    it('cùng khoá + cùng nội dung trả lại gói cũ (201, cùng id); khác nội dung trả 409 CONFLICT; chỉ có một gói', async () => {
      const key = 'F-KEY-REPLAY-0001';
      const first = await createPlan(plan('F_REPLAY'), key);
      assert.equal(first.status, 201);
      const replay = await createPlan(plan('F_REPLAY'), key);
      assert.equal(replay.status, 201);
      assert.equal(replay.body.id, first.body.id);
      const other = await createPlan(plan('F_REPLAY_OTHER'), key);
      assert.equal(other.status, 409);
      assert.equal(other.body.error.code, 'CONFLICT');
      assert.equal((await query("SELECT count(*)::int n FROM subscription_plans WHERE code LIKE 'F_REPLAY%'")).rows[0].n, 1);
    });

    it('cùng mã gói với khoá mới vẫn 409 (mã trùng), không 500', async () => {
      assert.equal((await createPlan(plan('F_REPLAY'), 'F-KEY-DUPCODE-0001')).status, 409);
    });
  });

  it('BootNotification chứa NUL bị trả CALLERROR FormationViolation (không phải InternalError) và trụ vẫn dùng được sau đó', { timeout: 60000 }, async () => {
    server = await startServerProcess();
    const client = await connectChargePoint(server.wsUrl, 'F-NUL-CP-1');
    const bad = await sendCall(client, 'b-bad', 'BootNotification', { chargePointVendor: 'V\u0000x', chargePointModel: 'M' });
    assert.equal(bad[0], 4);
    assert.equal(bad[2], 'FormationViolation');
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 300)); // để sự kiện đóng kết nối cũ xử lý xong
    const good = await bootChargePoint(server.wsUrl, 'F-NUL-CP-1');
    assert.equal((await query("SELECT status FROM charge_points WHERE code = 'F-NUL-CP-1'")).rows[0].status, 'ONLINE');
    good.close();
  });
});
