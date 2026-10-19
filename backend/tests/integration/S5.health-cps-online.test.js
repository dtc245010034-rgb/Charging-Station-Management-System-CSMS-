const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, bootChargePoint } = require('../helpers/server-process');

const CODE = 'S5-ONLINE-CP-01';

describe('S5: cpsOnline phản ánh ngay khi trụ Boot, không chờ snapshot 60 giây', () => {
  let admin;
  let server;

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();
    admin = await createUser('s5-admin@test.invalid', 'ADMIN');
    const owner = await createUser('s5-owner@test.invalid', 'STATION_OWNER');
    const stationId = (await postStation(owner, stationBody({ name: 'Station S5' }))).body.id;
    const cp = await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id", [stationId, CODE]);
    await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1)', [cp.rows[0].id]);
  });
  after(async () => {
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  const overview = async () => (await request(app).get('/api/health/overview').set('Cookie', admin.cookie)).body;
  async function eventually(read, expected, ms = 5000) {
    const deadline = Date.now() + ms;
    let value = await read();
    while (value !== expected && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      value = await read();
    }
    return value;
  }

  it('Boot được chấp nhận rồi gọi /health/overview ngay: now.cpsOnline = 1 và điểm cuối của series cũng là 1; ngắt kết nối thì về 0', { timeout: 60000 }, async () => {
    server = await startServerProcess(); // job snapshot chạy ngay lúc khởi động, khi chưa có trụ nào online
    const before = await overview();
    assert.equal(before.now.cpsOnline, 0);
    assert.equal(before.now.cpsTotal, 1);

    const client = await bootChargePoint(server.wsUrl, CODE);
    const after = await overview();
    assert.equal(after.now.cpsOnline, 1, 'không được chờ snapshot kế tiếp');
    assert.equal(after.series.at(-1).cpsOnline, 1);
    assert.equal(after.points.at(-1).cps_online, 1);
    assert.equal(after.now.cpsTotal, 1);

    client.close();
    assert.equal(await eventually(async () => (await overview()).now.cpsOnline, 0), 0, 'trụ ngắt kết nối phải về 0');
  });

  it('không có trụ online thì cpsOnline = 0 kể cả khi snapshot cũ còn ghi 1', async () => {
    await query("INSERT INTO health_minutes (minute_at, cps_online, cps_total, sessions_active) VALUES (date_trunc('minute', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 1, 1, 0) ON CONFLICT (minute_at) DO UPDATE SET cps_online = 1");
    await query("UPDATE charge_points SET status = 'UNKNOWN'");
    assert.equal((await overview()).now.cpsOnline, 0);
  });
});
