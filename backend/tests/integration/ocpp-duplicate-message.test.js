const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { BASE, run, query, resetSchema } = require('../helpers/db');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createMessageStore } = require('../../src/modules/ocpp/messages.repository');

const CODE = 'K01-CP-1';

describe('S-14 / K-01: tin trùng messageId nhận lại đúng câu trả lời cũ', () => {
  let pool;
  let logs;

  function makeConnection(code = CODE) {
    const sent = [];
    return { chargePointCode: code, isBootAccepted: true, send: (data, cb) => { sent.push(JSON.parse(data)); cb?.(); }, sent };
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

  it('cùng messageId khác nội dung: trả câu đầu tiên và ghi cảnh báo (không lộ payload)', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('diff-1', 'StartTransaction', { idTag: 'AAA' }));
    await server.handleMessage(connection, call('diff-1', 'StartTransaction', { idTag: 'SECRET-TAG' }));
    assert.equal(counter.n, 1);
    assert.deepEqual(connection.sent[1][2], connection.sent[0][2]);
    const warning = logs.find((line) => line.includes('diff-1'));
    assert.ok(warning, 'phải có cảnh báo');
    assert.ok(!logs.join('\n').includes('SECRET-TAG'));
  });

  it('khoá theo từng trụ: trụ khác dùng lại messageId vẫn chạy handler riêng', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    await server.handleMessage(makeConnection('K01-CP-A'), call('same-id', 'StartTransaction', {}));
    await server.handleMessage(makeConnection('K01-CP-B'), call('same-id', 'StartTransaction', {}));
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

  it('BootNotification không bị phát lại (cần ghi ONLINE và đánh dấu kết nối mới)', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('boot-1', 'BootNotification', {}));
    await server.handleMessage(connection, call('boot-1', 'BootNotification', {}));
    assert.equal(counter.boot, 2);
  });

  it('messageId quá dài thì xử lý bình thường, không lưu', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();
    const longId = 'x'.repeat(200);
    await server.handleMessage(connection, call(longId, 'StartTransaction', {}));
    await server.handleMessage(connection, call(longId, 'StartTransaction', {}));
    assert.equal(counter.n, 2);
    assert.equal((await query('SELECT count(*)::int AS n FROM ocpp_messages')).rows[0].n, 0);
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

  it('tin đang xử lý bị bỏ rơi (tiến trình chết) quá hạn thì được xử lý lại', async () => {
    const counter = { n: 0, boot: 0, fail: 0 };
    await query("INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, created_at) VALUES ($1, 'stale-1', 'StartTransaction', 'x', now() - interval '5 minutes')", [CODE]);
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('stale-1', 'StartTransaction', {}));
    assert.equal(counter.n, 1);
    assert.equal(connection.sent[0][0], 3);
  });

  it('dọn tin cũ hơn N ngày, giữ tin mới', async () => {
    const store = createMessageStore(pool);
    await query("INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, response, created_at) VALUES ('CP', 'old', 'Heartbeat', 'h', '{}', now() - interval '8 days'), ('CP', 'new', 'Heartbeat', 'h', '{}', now() - interval '6 days')");
    const removed = await store.purgeOlderThan(7);
    assert.equal(removed, 1);
    const left = (await query('SELECT message_id FROM ocpp_messages')).rows.map((row) => row.message_id);
    assert.deepEqual(left, ['new']);
  });
});
