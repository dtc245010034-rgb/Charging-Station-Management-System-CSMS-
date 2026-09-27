const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, idempotencyKey, postStation } = require('../helpers/station');
const connections = require('../../src/modules/charge-points/connection-registry');

describe('S-04/S-05 quản lý trạm, trụ và đầu nối', () => {
  let owner;
  let otherOwner;

  const post = (url, body, user = owner) => request(app).post(url).set('Cookie', user.cookie).send(body);
  const patch = (url, body, user = owner) => request(app).patch(url).set('Cookie', user.cookie).send(body);

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('station-owner@example.com', 'STATION_OWNER');
    otherOwner = await createUser('other-owner@example.com', 'STATION_OWNER');
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('rejects invalid coordinates and replays a station request by idempotency key', async () => {
    const invalid = await post('/api/stations', { name: 'Bad', address: 'HN', latitude: 95, longitude: 20 });
    assert.strictEqual(invalid.status, 400);

    const body = { name: 'Trạm A', address: 'Hà Nội', latitude: '21.12345678', longitude: '105.12345678' };
    const first = await request(app).post('/api/stations').set('Cookie', owner.cookie)
      .set('Idempotency-Key', 'station-request-0001').send(body);
    const replay = await request(app).post('/api/stations').set('Cookie', owner.cookie)
      .set('Idempotency-Key', 'station-request-0001').send(body);
    assert.strictEqual(first.status, 201);
    assert.strictEqual(replay.status, 201);
    assert.strictEqual(String(first.body.id), String(replay.body.id));
    assert.strictEqual((await query('SELECT count(*)::int AS count FROM stations WHERE owner_id = $1', [owner.id])).rows[0].count, 1);
    const changed = await request(app).post('/api/stations').set('Cookie', owner.cookie)
      .set('Idempotency-Key', 'station-request-0001').send({ ...body, name: 'Trạm B' });
    assert.strictEqual(changed.status, 409);
  });

  it('creates the requested connectors, checks code availability, and scopes station access', async () => {
    const station = (await request(app).get('/api/stations').set('Cookie', owner.cookie)).body[0];
    const created = await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-S05', connector_count: 3 });
    assert.strictEqual(created.status, 201);
    const details = await request(app).get(`/api/stations/${station.id}`).set('Cookie', owner.cookie);
    assert.deepStrictEqual(details.body.charge_points[0].connectors.map((connector) => connector.connector_no), [1, 2, 3]);
    assert.strictEqual((await request(app).get('/api/charge-points/check-code?code=CP-S05').set('Cookie', owner.cookie)).body.is_available, false);
    assert.strictEqual((await request(app).get('/api/charge-points/check-code?code=CP-FREE').set('Cookie', owner.cookie)).body.is_available, true);
    assert.strictEqual((await post(`/api/stations/${station.id}/charge-points`, { code: 'CP-S05' }, otherOwner)).status, 403);
  });

  it('rejects coordinate changes while active and code changes while connected', async () => {
    const station = (await request(app).get('/api/stations').set('Cookie', owner.cookie)).body[0];
    assert.strictEqual((await patch(`/api/stations/${station.id}`, { status: 'ACTIVE' })).status, 200);
    assert.strictEqual((await patch(`/api/stations/${station.id}`, { latitude: 22, longitude: 106 })).status, 400);
    assert.strictEqual((await patch(`/api/stations/${station.id}`, { status: 'INACTIVE' })).status, 200);
    assert.strictEqual((await patch(`/api/stations/${station.id}`, { latitude: 22, longitude: 106 })).status, 200);

    const point = (await request(app).get(`/api/stations/${station.id}`).set('Cookie', owner.cookie)).body.charge_points[0];
    connections.connect(point.code);
    try {
      assert.strictEqual((await patch(`/api/charge-points/${point.id}`, { code: 'CP-RENAMED' })).status, 409);
    } finally {
      connections.disconnect(point.code);
    }
    assert.strictEqual((await patch(`/api/charge-points/${point.id}`, { code: 'CP-RENAMED' })).status, 200);
  });

  it('restricts deleting an owner while owned stations remain', async () => {
    await query('DELETE FROM audit_logs WHERE user_id = $1', [owner.id]);
    await query('DELETE FROM idempotency_keys WHERE user_id = $1', [owner.id]);
    await assert.rejects(query('DELETE FROM users WHERE id = $1', [owner.id]));
  });
  describe('AC nghiệm thu S-04 phía máy chủ', () => {
    const countStations = async () => (await query('SELECT count(*)::int AS count FROM stations')).rows[0].count;

    it('S04-AC-01: trạm mới luôn ở trạng thái chưa hoạt động, gửi status thì bị từ chối', async () => {
      const before = await countStations();
      const res = await postStation(owner, stationBody({ status: 'ACTIVE' }));
      assert.strictEqual(res.status, 400);
      assert.strictEqual(await countStations(), before);
      const ok = await postStation(owner);
      assert.strictEqual(ok.status, 201);
      assert.strictEqual(ok.body.status, 'INACTIVE');
      assert.strictEqual(String(ok.body.owner_id), String(owner.id));
    });

    it('S04-AC-01: thiếu toạ độ, hoặc tên/địa chỉ chỉ có dấu cách thì 400 và không tạo bản ghi', async () => {
      const before = await countStations();
      const bodies = [
        { name: 'A', address: 'B' },
        stationBody({ latitude: undefined, longitude: undefined }),
        stationBody({ latitude: null, longitude: null }),
        stationBody({ name: '   ' }),
        stationBody({ address: ' ' }),
      ];
      for (const body of bodies) assert.strictEqual((await postStation(owner, body)).status, 400, JSON.stringify(body));
      assert.strictEqual(await countStations(), before);
    });

    it('S04-AC-02: toạ độ ngoài dải hoặc không phải số bị 400 và không tạo bản ghi', async () => {
      const before = await countStations();
      for (const body of [stationBody({ latitude: 91 }), stationBody({ longitude: 181 }), stationBody({ latitude: 'abc' })]) {
        assert.strictEqual((await postStation(owner, body)).status, 400, JSON.stringify(body));
      }
      assert.strictEqual(await countStations(), before);
    });

    it('S04-AC-03: sửa tên/địa chỉ hiện ngay trong danh sách; tên trống hoặc xoá toạ độ bị từ chối', async () => {
      const created = (await postStation(owner)).body;
      assert.strictEqual((await patch(`/api/stations/${created.id}`, { name: 'Tên mới', address: 'Địa chỉ mới' })).status, 200);
      const listed = (await request(app).get('/api/stations').set('Cookie', owner.cookie)).body.find((s) => s.id === created.id);
      assert.deepStrictEqual([listed.name, listed.address], ['Tên mới', 'Địa chỉ mới']);
      assert.strictEqual((await patch(`/api/stations/${created.id}`, { name: '  ' })).status, 400);
      assert.strictEqual((await patch(`/api/stations/${created.id}`, { latitude: null, longitude: null })).status, 400);
    });

    it('S04-AC-04: thiếu Idempotency-Key thì 400; 5 request song song cùng key chỉ tạo 1 trạm', async () => {
      const before = await countStations();
      const missing = await request(app).post('/api/stations').set('Cookie', owner.cookie).send(stationBody());
      assert.strictEqual(missing.status, 400);
      assert.strictEqual(await countStations(), before);

      const key = idempotencyKey();
      const results = await Promise.all(Array.from({ length: 5 }, () => postStation(owner, stationBody({ name: 'Song song' }), key)));
      assert.ok(results.every((r) => r.status === 201), results.map((r) => r.status).join());
      assert.strictEqual(new Set(results.map((r) => String(r.body.id))).size, 1);
      assert.strictEqual(await countStations(), before + 1);
    });
  });
});
