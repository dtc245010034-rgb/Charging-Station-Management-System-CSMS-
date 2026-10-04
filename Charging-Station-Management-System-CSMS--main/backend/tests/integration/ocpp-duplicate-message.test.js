const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { BASE, run, query, resetSchema } = require('../helpers/db');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createMessageStore } = require('../../src/modules/ocpp/messages.repository');
const { createMessageCleanupJob } = require('../../src/modules/ocpp/messages-cleanup-job');

const CODE = 'K01-CP-1';
const OTHER_CODE = 'K01-CP-2';

describe('S-14 / K-01: tin trùng messageId nhận lại đúng câu trả lời cũ', () => {
  let pool;
  let logs;
  const chargePointIds = new Map();

  function makeConnection(code = CODE) {
    const sent = [];
    return { chargePointCode: code, chargePointId: chargePointIds.get(code), isBootAccepted: true, send: (data, cb) => { sent.push(JSON.parse(data)); cb?.(); }, sent };
  }

  // Mỗi lần gọi tương ứng một "lần khởi động" của máy chủ: bộ xử lý mới, bộ nhớ trong tiến trình trống, chung DB.
  function makeServer({ counter, slow = 0 } = {}) {
    return createOcppMessageHandler({
      handlers: {
        StartTransaction: async () => {
          counter.n += 1;
          if (slow) await new Promise((resolve) => setTimeout(resolve, slow));
          return { transactionId: counter.n, idTagInfo: { status: 'Accepted' } };
        },
        BootNotification: async () => { counter.boot += 1; return { status: 'Accepted' }; },
        Failing: async () => { counter.fail += 1; throw new Error('boom'); },
      },
      messageStore: createMessageStore(pool),
      logWarning: (line) => logs.push(line),
      logError: () => {},
      logInfo: () => {},
    });
  }

  const call = (messageId, action, payload) => JSON.stringify([2, messageId, action, payload]);

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    pool = new Pool({ connectionString: BASE });
    const user = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Test owner', 'ocpp-message-owner@test.invalid', 'unused') RETURNING id"
    );
    const station = await query(
      "INSERT INTO stations (name, address, owner_id) VALUES ('OCPP message station', 'test', $1) RETURNING id",
      [user.rows[0].id]
    );
    for (const code of [CODE, OTHER_CODE]) {
      const chargePoint = await query(
        "INSERT INTO charge_points (station_id, code) VALUES ($1, $2) RETURNING id",
        [station.rows[0].id, code]
      );
      chargePointIds.set(code, chargePoint.rows[0].id);
    }
  });
  after(async () => { await pool.end(); await resetSchema(); });
  beforeEach(async () => { logs = []; await query('TRUNCATE ocpp_messages'); });

  it('gửi lại 5 lần cùng messageId: handler chỉ chạy 1 lần, cả 5 nhận cùng transactionId', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();
    for (let i = 0; i < 5; i += 1) await server.handleMessage(connection, call('dup-1', 'StartTransaction', { idTag: 'T1' }));
    assert.equal(counter.n, 1);
    assert.deepEqual(connection.sent.map((frame) => frame[2].transactionId), [1, 1, 1, 1, 1]);
  });

  it('khởi động lại giữa hai lần gửi vẫn nhận ra tin trùng (lưu DB)', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const first = makeConnection();
    await makeServer({ counter }).handleMessage(first, call('restart-1', 'StartTransaction', { idTag: 'T1' }));
    const second = makeConnection();
    await makeServer({ counter }).handleMessage(second, call('restart-1', 'StartTransaction', { idTag: 'T1' }));
    assert.equal(counter.n, 1);
    assert.deepEqual(second.sent[0][2], first.sent[0][2]);
  });

  it('hai tin trùng tới cùng lúc: chỉ một cái chạy handler', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter, slow: 50 });
    const connection = makeConnection();
    await Promise.all(Array.from({ length: 6 }, () => server.handleMessage(connection, call('race-1', 'StartTransaction', { idTag: 'T1' }))));
    assert.equal(counter.n, 1);
    assert.equal(new Set(connection.sent.map((frame) => frame[2].transactionId)).size, 1);
    assert.equal(connection.sent.length, 6);
  });

  it('hai tin trùng cùng lúc ở hai bộ xử lý (hai tiến trình) vẫn chỉ một cái chạy handler', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const a = makeServer({ counter, slow: 50 });
    const b = makeServer({ counter, slow: 50 });
    const connection = makeConnection();
    await Promise.all([
      a.handleMessage(connection, call('race-2', 'StartTransaction', { idTag: 'T1' })),
      b.handleMessage(connection, call('race-2', 'StartTransaction', { idTag: 'T1' })),
    ]);
    assert.equal(counter.n, 1);
    assert.equal(new Set(connection.sent.map((frame) => frame[2].transactionId)).size, 1);
  });

  it('cùng messageId khác nội dung: phát lại câu trả lời đầu và ghi cảnh báo không lộ payload', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('diff-1', 'StartTransaction', { idTag: 'AAA' }));
    await server.handleMessage(connection, call('diff-1', 'StartTransaction', { idTag: 'SECRET-TAG' }));
    assert.equal(counter.n, 1);
    assert.deepEqual(connection.sent[1][2], connection.sent[0][2]);
    assert.ok(logs.some((line) => line.includes('different content')));
    assert.ok(!logs.join('\n').includes('SECRET-TAG'));
  });

  it('khoá theo từng trụ: trụ khác dùng lại messageId vẫn chạy handler riêng', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    await server.handleMessage(makeConnection(CODE), call('same-id', 'StartTransaction', {}));
    await server.handleMessage(makeConnection(OTHER_CODE), call('same-id', 'StartTransaction', {}));
    assert.equal(counter.n, 2);
  });

  it('handler lỗi thì không lưu: gửi lại sẽ chạy handler lần nữa', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('fail-1', 'Failing', {}));
    await server.handleMessage(connection, call('fail-1', 'Failing', {}));
    assert.equal(counter.fail, 2);
    assert.equal(connection.sent[0][0], 4);
    assert.equal((await query("SELECT count(*)::int AS n FROM ocpp_messages WHERE message_id = 'fail-1'")).rows[0].n, 0);
  });

  it('BootNotification phát lại phản hồi nhưng không chạy handler lần hai', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('boot-1', 'BootNotification', {}));
    await server.handleMessage(connection, call('boot-1', 'BootNotification', {}));
    assert.equal(counter.boot, 1);
    assert.equal(connection.sent[1][2].status, 'Accepted');
  });

  it('messageId không bị bỏ qua do độ dài và vẫn được chống trùng', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();
    const longId = 'x'.repeat(200);
    await server.handleMessage(connection, call(longId, 'StartTransaction', {}));
    await server.handleMessage(connection, call(longId, 'StartTransaction', {}));
    assert.equal(counter.n, 1);
    assert.equal((await query('SELECT count(*)::int AS n FROM ocpp_messages')).rows[0].n, 1);
  });

  it('DB lỗi khi tra tin trùng: trả InternalError, không chạy handler', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const brokenPool = { query: async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432'); } };
    const server = createOcppMessageHandler({
      handlers: { StartTransaction: async () => { counter.n += 1; return {}; } },
      messageStore: createMessageStore(brokenPool),
      logWarning: () => {}, logError: (...args) => logs.push(args.join(' ')), logInfo: () => {},
    });
    const connection = makeConnection();
    await server.handleMessage(connection, call('db-1', 'StartTransaction', {}));
    assert.equal(counter.n, 0);
    assert.equal(connection.sent[0][0], 4);
    assert.equal(connection.sent[0][2], 'InternalError');
    assert.ok(!JSON.stringify(connection.sent[0]).includes('10.0.0.5'));
  });

  it('dọn tin cũ hơn N ngày, giữ tin mới', async () => {
    const store = createMessageStore(pool);
    await query("INSERT INTO ocpp_messages (charge_point_id, message_id, action, payload_hash, response, created_at) VALUES ($1, 'old', 'Heartbeat', 'h', '{}', CURRENT_TIMESTAMP - interval '8 days'), ($1, 'new', 'Heartbeat', 'h', '{}', CURRENT_TIMESTAMP - interval '6 days')", [chargePointIds.get(CODE)]);
    const job = createMessageCleanupJob({ messageStore: store, retentionDays: 7, logInfo: () => {} });
    const removed = await job.run();
    assert.equal(removed, 1);
    const left = (await query('SELECT message_id FROM ocpp_messages')).rows.map((row) => row.message_id);
    assert.deepEqual(left, ['new']);
  });
});
