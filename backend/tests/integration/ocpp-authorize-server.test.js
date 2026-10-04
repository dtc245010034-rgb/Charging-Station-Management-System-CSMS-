const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

const CODE = 'AUTH-SRV-CP-01';

describe('S-15 Authorize trên WebSocket server thật (GYM-41)', () => {
  let server;
  let client;
  let owner;
  let userId;

  const VALID_TAG = 'TAG-REAL-SRV-01';
  const BLOCKED_TAG = 'TAG-BLOCKED-SRV';
  const EXPIRED_TAG = 'TAG-EXPIRED-SRV';

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();

    owner = await createUser('owner-auth-srv@test.invalid', 'STATION_OWNER');
    const userRes = await query("INSERT INTO users (name, email, password_hash) VALUES ('Driver Srv', 'driver-srv@test.local', 'hash') RETURNING id");
    userId = userRes.rows[0].id;

    const stationId = (await postStation(owner, stationBody({ name: 'Station Auth Srv' }))).body.id;
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [stationId]);
    await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN')", [stationId, CODE]);

    // Tạo các loại thẻ trong DB
    await query("INSERT INTO id_tags (tag, user_id, status, expires_at) VALUES ($1, $2, 'ACTIVE', NULL)", [VALID_TAG, userId]);
    await query("INSERT INTO id_tags (tag, user_id, status, expires_at) VALUES ($1, $2, 'BLOCKED', NULL)", [BLOCKED_TAG, userId]);
    await query("INSERT INTO id_tags (tag, user_id, status, expires_at) VALUES ($1, $2, 'ACTIVE', now() - interval '2 days')", [EXPIRED_TAG, userId]);

    server = await startServerProcess();
  });

  after(async () => {
    client?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  it('gửi Authorize trước BootNotification: bị từ chối SecurityError và kết nối vẫn mở', async () => {
    const rawClient = new WebSocket(`${server.wsUrl}/ocpp/${CODE}`, ['ocpp1.6']);
    await new Promise((resolve, reject) => {
      rawClient.once('open', resolve);
      rawClient.once('error', reject);
    });

    const res = await sendCall(rawClient, 'pre-boot-auth', 'Authorize', { idTag: VALID_TAG });
    assert.equal(res[0], 4, 'Phải trả về CALLERROR');
    assert.equal(res[2], 'SecurityError', 'Lỗi phải là SecurityError khi chưa Boot');
    assert.equal(rawClient.readyState, WebSocket.OPEN, 'Kết nối phải giữ mở');
    rawClient.terminate();
  });

  it('sau khi Boot thành công: thẻ hợp lệ nhận Accepted', async () => {
    client = await bootChargePoint(server.wsUrl, CODE);
    const res = await sendCall(client, 'auth-valid', 'Authorize', { idTag: VALID_TAG });
    assert.equal(res[0], 3);
    assert.deepEqual(res[2], { idTagInfo: { status: 'Accepted' } });
  });

  it('chuẩn CiString20Type: thẻ chữ thường khớp thẻ chữ hoa trong DB (Case-Insensitive)', async () => {
    const lowerTag = VALID_TAG.toLowerCase();
    const res = await sendCall(client, 'auth-ci', 'Authorize', { idTag: lowerTag });
    assert.equal(res[0], 3);
    assert.deepEqual(res[2], { idTagInfo: { status: 'Accepted' } });
  });

  it('tích hợp S-14: gửi lại cùng messageId nhận lại câu trả lời cũ từ ocpp_messages', async () => {
    const first = await sendCall(client, 'auth-dup-msg', 'Authorize', { idTag: VALID_TAG });
    const second = await sendCall(client, 'auth-dup-msg', 'Authorize', { idTag: VALID_TAG });

    assert.equal(first[0], 3);
    assert.equal(second[0], 3);
    assert.deepEqual(first[2], second[2]);

    const count = (await query("SELECT count(*)::int AS n FROM ocpp_messages WHERE charge_point_code = $1 AND message_id = 'auth-dup-msg'", [CODE])).rows[0].n;
    assert.equal(count, 1, 'ocpp_messages chỉ lưu đúng 1 bản ghi chống trùng cho Authorize');
  });

  it('thẻ bị khoá nhận Blocked; thẻ quá hạn nhận Expired; thẻ lạ nhận Invalid', async () => {
    const blockedRes = await sendCall(client, 'auth-blk', 'Authorize', { idTag: BLOCKED_TAG });
    assert.deepEqual(blockedRes[2], { idTagInfo: { status: 'Blocked' } });

    const expiredRes = await sendCall(client, 'auth-exp', 'Authorize', { idTag: EXPIRED_TAG });
    assert.deepEqual(expiredRes[2], { idTagInfo: { status: 'Expired' } });

    const invalidRes = await sendCall(client, 'auth-inv', 'Authorize', { idTag: 'NON-EXISTENT' });
    assert.deepEqual(invalidRes[2], { idTagInfo: { status: 'Invalid' } });
  });

  it('thẻ dài hơn 20 ký tự trả về CALLERROR FormationViolation', async () => {
    const longTag = '123456789012345678901';
    const res = await sendCall(client, 'auth-too-long', 'Authorize', { idTag: longTag });
    assert.equal(res[0], 4);
    assert.equal(res[2], 'FormationViolation');
  });
});
