const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { BASE, run, query, resetSchema, truncateAll } = require('../helpers/db');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createAuthorizeHandler, evaluateIdTag } = require('../../src/modules/ocpp/handlers/authorize');

describe('S-15: Xác thực thẻ qua Authorize (GYM-41)', () => {
  let pool;
  let logs;
  let activeStationId;
  let inactiveStationId;
  let lockedStationId;

  const ACTIVE_CP = 'CP-AUTH-ACTIVE';
  const INACTIVE_CP = 'CP-AUTH-INACTIVE';
  const LOCKED_CP = 'CP-AUTH-LOCKED';

  const VALID_TAG = 'TAG-VALID-1234';
  const BLOCKED_TAG = 'TAG-BLOCKED-5678';
  const EXPIRED_TAG = 'TAG-EXPIRED-9999';

  function makeConnection(code = ACTIVE_CP, isStationLocked = false) {
    const sent = [];
    return {
      chargePointCode: code,
      isBootAccepted: true,
      isStationLocked,
      send: (data, callback) => {
        sent.push(JSON.parse(data));
        callback?.();
      },
      sent,
    };
  }

  function makeServer() {
    return createOcppMessageHandler({
      handlers: {
        Authorize: createAuthorizeHandler({
          pool,
          logWarning: (msg) => logs.push(msg),
          logInfo: (msg) => logs.push(msg),
          logError: (msg) => logs.push(msg),
        }),
      },
      logWarning: (msg) => logs.push(msg),
      logInfo: (msg) => logs.push(msg),
      logError: () => {},
    });
  }

  const callFrame = (messageId, action, payload) => JSON.stringify([2, messageId, action, payload]);

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    pool = new Pool({ connectionString: BASE });

    // Tạo user và các trạm test
    const userRes = await query("INSERT INTO users (name, email, password_hash) VALUES ('Driver Test', 'driver-auth@test.local', 'hash') RETURNING id");
    const userId = userRes.rows[0].id;

    const stActive = await query("INSERT INTO stations (name, address, latitude, longitude, status, owner_id) VALUES ('Station Active', '123 Active', 21.0, 105.0, 'ACTIVE', $1) RETURNING id", [userId]);
    activeStationId = stActive.rows[0].id;

    const stInactive = await query("INSERT INTO stations (name, address, latitude, longitude, status, owner_id) VALUES ('Station Inactive', '456 Inactive', 21.0, 105.0, 'INACTIVE', $1) RETURNING id", [userId]);
    inactiveStationId = stInactive.rows[0].id;

    const stLocked = await query("INSERT INTO stations (name, address, latitude, longitude, status, locked_at, owner_id) VALUES ('Station Locked', '789 Locked', 21.0, 105.0, 'ACTIVE', now(), $1) RETURNING id", [userId]);
    lockedStationId = stLocked.rows[0].id;

    await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'ONLINE')", [activeStationId, ACTIVE_CP]);
    await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'ONLINE')", [inactiveStationId, INACTIVE_CP]);
    await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'ONLINE')", [lockedStationId, LOCKED_CP]);

    // Tạo id_tags
    await query("INSERT INTO id_tags (tag, user_id, status, expires_at) VALUES ($1, $2, 'ACTIVE', NULL)", [VALID_TAG, userId]);
    await query("INSERT INTO id_tags (tag, user_id, status, expires_at) VALUES ($1, $2, 'BLOCKED', NULL)", [BLOCKED_TAG, userId]);
    await query("INSERT INTO id_tags (tag, user_id, status, expires_at) VALUES ($1, $2, 'ACTIVE', now() - interval '10 days')", [EXPIRED_TAG, userId]);
  });

  after(async () => {
    await pool.end();
    await resetSchema();
  });

  beforeEach(() => {
    logs = [];
  });

  it('AC1: thẻ hợp lệ, trạm hoạt động → Accepted', async () => {
    const server = makeServer();
    const conn = makeConnection(ACTIVE_CP);

    await server.handleMessage(conn, callFrame('auth-1', 'Authorize', { idTag: VALID_TAG }));

    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0][0], 3); // CALLRESULT
    assert.equal(conn.sent[0][1], 'auth-1');
    assert.deepEqual(conn.sent[0][2], { idTagInfo: { status: 'Accepted' } });
  });

  it('AC2: thẻ bị khoá → Blocked', async () => {
    const server = makeServer();
    const conn = makeConnection(ACTIVE_CP);

    await server.handleMessage(conn, callFrame('auth-2', 'Authorize', { idTag: BLOCKED_TAG }));

    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0][0], 3);
    assert.deepEqual(conn.sent[0][2], { idTagInfo: { status: 'Blocked' } });
  });

  it('AC3: thẻ quá hạn → Expired', async () => {
    const server = makeServer();
    const conn = makeConnection(ACTIVE_CP);

    await server.handleMessage(conn, callFrame('auth-3', 'Authorize', { idTag: EXPIRED_TAG }));

    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0][0], 3);
    assert.deepEqual(conn.sent[0][2], { idTagInfo: { status: 'Expired' } });
  });

  it('AC4: thẻ không có trong bảng id_tags → Invalid và ghi nhật ký lần thử', async () => {
    const server = makeServer();
    const conn = makeConnection(ACTIVE_CP);

    await server.handleMessage(conn, callFrame('auth-4', 'Authorize', { idTag: 'NON-EXISTENT-TAG' }));

    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0][0], 3);
    assert.deepEqual(conn.sent[0][2], { idTagInfo: { status: 'Invalid' } });

    // Kiểm tra có log ghi nhận lần thử thẻ không hợp lệ
    const warnLogs = logs.join('\n');
    assert.ok(warnLogs.includes('Invalid') || warnLogs.includes('Authorize: Thẻ không tồn tại'));
  });

  it('AC5: trạm tạm ngừng hoặc bị khoá + thẻ hợp lệ → Blocked', async () => {
    const server = makeServer();

    // Ca 1: Trạm INACTIVE
    const connInactive = makeConnection(INACTIVE_CP);
    await server.handleMessage(connInactive, callFrame('auth-5a', 'Authorize', { idTag: VALID_TAG }));
    assert.equal(connInactive.sent.length, 1);
    assert.deepEqual(connInactive.sent[0][2], { idTagInfo: { status: 'Blocked' } });

    // Ca 2: Trạm bị khoá (locked_at khác NULL)
    const connLocked = makeConnection(LOCKED_CP, true);
    await server.handleMessage(connLocked, callFrame('auth-5b', 'Authorize', { idTag: VALID_TAG }));
    // Nếu trạm bị khoá, lớp bảo mật khung gửi CALLERROR SecurityError hoặc nếu tin vào handler thì trả Blocked
    assert.equal(connLocked.sent.length, 1);
    const response = connLocked.sent[0];
    if (response[0] === 3) {
      assert.deepEqual(response[2], { idTagInfo: { status: 'Blocked' } });
    } else {
      assert.equal(response[0], 4);
      assert.equal(response[2], 'SecurityError');
    }
  });

  it('NFR: log chỉ chứa 4 ký tự cuối của thẻ', async () => {
    const server = makeServer();
    const conn = makeConnection(ACTIVE_CP);

    const secretTag = 'SECRETTAG1234';
    await server.handleMessage(conn, callFrame('auth-nfr', 'Authorize', { idTag: secretTag }));

    const allLogs = logs.join('\n');
    // Tuyệt đối không chứa chuỗi thẻ thô
    assert.ok(!allLogs.includes(secretTag), 'Log không được chứa chuỗi idTag thô');
    // Phải chứa 4 ký tự cuối đã che
    assert.ok(allLogs.includes('1234'), 'Log phải chứa 4 ký tự cuối');
    assert.ok(allLogs.includes('*********1234'), 'Log phải che các ký tự đầu bằng dấu sao');
  });

  it('idTag dài hơn 20 ký tự bị từ chối (FormationViolation)', async () => {
    const server = makeServer();
    const conn = makeConnection(ACTIVE_CP);

    const longTag = '123456789012345678901'; // 21 ký tự
    await server.handleMessage(conn, callFrame('auth-long', 'Authorize', { idTag: longTag }));

    assert.equal(conn.sent.length, 1);
    assert.equal(conn.sent[0][0], 4); // CALLERROR
    assert.equal(conn.sent[0][2], 'FormationViolation');
  });

  it('evaluateIdTag là hàm thuần, xuất ra được cho S-17', () => {
    assert.equal(typeof evaluateIdTag, 'function');
    assert.equal(evaluateIdTag({ tag: { status: 'ACTIVE' }, station: { status: 'ACTIVE' } }), 'Accepted');
    assert.equal(evaluateIdTag({ tag: { status: 'BLOCKED' }, station: { status: 'ACTIVE' } }), 'Blocked');
    assert.equal(evaluateIdTag({ tag: { status: 'ACTIVE', expires_at: new Date('2020-01-01') }, station: { status: 'ACTIVE' } }), 'Expired');
    assert.equal(evaluateIdTag({ tag: null }), 'Invalid');
    assert.equal(evaluateIdTag({ tag: { status: 'ACTIVE' }, station: { status: 'INACTIVE' } }), 'Blocked');
    assert.equal(evaluateIdTag({ tag: { status: 'ACTIVE' }, station: { status: 'ACTIVE', locked_at: new Date() } }), 'Blocked');
  });
});
