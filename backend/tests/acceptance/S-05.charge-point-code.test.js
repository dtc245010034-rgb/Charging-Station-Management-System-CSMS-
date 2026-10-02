const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');

describe('S-05: mã trụ chuẩn hoá chữ hoa, power_kw và status', () => {
  let owner;
  let otherOwner;
  let stationA;
  let stationB;

  const post = (url, body, user = owner) => request(app).post(url).set('Cookie', user.cookie).send(body);
  const patch = (url, body, user = owner) => request(app).patch(url).set('Cookie', user.cookie).send(body);
  const get = (url, user = owner) => request(app).get(url).set('Cookie', user.cookie);

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();
    owner = await createUser('cp-owner@example.com', 'STATION_OWNER');
    otherOwner = await createUser('cp-other@example.com', 'STATION_OWNER');
    stationA = (await postStation(owner, stationBody({ name: 'Trạm A' }))).body;
    stationB = (await postStation(otherOwner, stationBody({ name: 'Trạm B' }))).body;
  });
  after(async () => { await resetSchema(); await closePool(); });

  it('S05-BUG-01: mã trụ luôn lưu chữ hoa; khác hoa/thường coi là trùng dù khác trạm khác chủ', async () => {
    const created = await post(`/api/stations/${stationA.id}/charge-points`, { code: 'cp-n1' });
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.body.code, 'CP-N1');

    const dup = await post(`/api/stations/${stationB.id}/charge-points`, { code: 'Cp-N1' }, otherOwner);
    assert.strictEqual(dup.status, 409);

    assert.strictEqual((await get('/api/charge-points/check-code?code=cp-n1')).body.is_available, false);
    assert.strictEqual((await get('/api/charge-points/check-code?code=CP-N1')).body.is_available, false);
  });

  it('S05-BUG-02: power_kw phải là số không âm; chuỗi rác bị 400, không đổi thầm thành 0', async () => {
    assert.strictEqual((await post(`/api/stations/${stationA.id}/charge-points`, { code: 'CP-PW1', power_kw: 'abc' })).status, 400);
    assert.strictEqual((await post(`/api/stations/${stationA.id}/charge-points`, { code: 'CP-PW2', power_kw: -5 })).status, 400);
    const ok = await post(`/api/stations/${stationA.id}/charge-points`, { code: 'CP-PW3', power_kw: '7.5' });
    assert.strictEqual(ok.status, 201);
    assert.strictEqual(Number(ok.body.power_kw), 7.5);
    assert.strictEqual((await patch(`/api/charge-points/${ok.body.id}`, { power_kw: 'abc' })).status, 400);
  });

  it('S05-BUG-03: status trụ do hệ thống quản lý, chủ trạm không được đặt lúc tạo hoặc sửa', async () => {
    const rejected = await post(`/api/stations/${stationA.id}/charge-points`, { code: 'CP-ST1', status: 'lung tung' });
    assert.strictEqual(rejected.status, 400);
    const created = await post(`/api/stations/${stationA.id}/charge-points`, { code: 'CP-ST2' });
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.body.status, 'UNKNOWN');
    assert.strictEqual((await patch(`/api/charge-points/${created.body.id}`, { status: 'ACTIVE' })).status, 400);
  });

  it('005: migration chuẩn hoá mã cũ về chữ hoa và chặn được bằng CHECK; rollback bỏ được CHECK', async () => {
    const check = await query("SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'charge_points_code_upper_check'");
    assert.strictEqual(check.rowCount, 1);
    const bypass = await query("INSERT INTO charge_points (station_id, code) VALUES ($1, 'lowercase-code')", [stationA.id]).catch((e) => e);
    assert.ok(bypass instanceof Error, 'CHECK phải chặn mã chữ thường ghi trực tiếp');

    while (true) {
      const has005 = await query("SELECT 1 FROM schema_migrations WHERE version = '005_charge_point_code_upper.sql'");
      if (!has005.rowCount) break;
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
    }

    const afterDown = await query("SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'charge_points_code_upper_check'");
    assert.strictEqual(afterDown.rowCount, 0);
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    const afterUp = await query("SELECT 1 FROM information_schema.check_constraints WHERE constraint_name = 'charge_points_code_upper_check'");
    assert.strictEqual(afterUp.rowCount, 1);
  });
});
