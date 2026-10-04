const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { BASE, run, query, resetSchema } = require('../helpers/db');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createMessageStore, hashCall } = require('../../src/modules/ocpp/messages.repository');

const CODE = 'F8-CP-1';

describe('S-14/F11: tin trùng messageId luôn phát lại câu trả lời đầu trong thời gian lưu', () => {
  let pool;
  let logs;

  function makeConnection() {
    const sent = [];
    return { chargePointCode: CODE, isBootAccepted: true, send: (data, cb) => { sent.push(JSON.parse(data)); cb?.(); }, sent };
  }

  function makeServer({ counter, slow = 0 } = {}) {
    return createOcppMessageHandler({
      handlers: {
        StatusNotification: async (payload) => {
          counter.status += 1;
          counter.lastStatus = payload.status;
          if (slow) await new Promise((resolve) => setTimeout(resolve, slow));
          return { run: counter.status };
        },
        Heartbeat: async () => { counter.heartbeat += 1; return { currentTime: 'x' }; },
      },
      messageStore: createMessageStore(pool),
      logWarning: (line) => logs.push(line),
      logError: () => {},
      logInfo: () => {},
    });
  }

  const call = (messageId, action, payload) => JSON.stringify([2, messageId, action, payload]);
  const newCounter = () => ({ status: 0, heartbeat: 0, lastStatus: null });

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    pool = new Pool({ connectionString: BASE });
  });
  after(async () => { await pool.end(); await resetSchema(); });
  beforeEach(async () => { logs = []; await query('TRUNCATE ocpp_messages'); });

  it('trụ khởi động lại gửi lại messageId "7" với nội dung khác: phát lại response đầu', async () => {
    const counter = newCounter();
    const server = makeServer({ counter });
    const session1 = makeConnection();
    await server.handleMessage(session1, call('7', 'StatusNotification', { connectorId: 1, status: 'Available' }));
    const session2 = makeConnection();
    await server.handleMessage(session2, call('7', 'StatusNotification', { connectorId: 1, status: 'Faulted' }));
    assert.equal(counter.status, 1);
    assert.equal(counter.lastStatus, 'Available');
    assert.deepEqual(session2.sent[0][2], { run: 1 });
    assert.ok(logs.some((line) => line.includes('Conflicting CALL reused messageId')));
  });

  it('gửi lại nội dung xung đột nhiều lần vẫn luôn nhận response đầu', async () => {
    const counter = newCounter();
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('7', 'StatusNotification', { status: 'Available' }));
    await server.handleMessage(connection, call('7', 'StatusNotification', { status: 'Faulted' }));
    await server.handleMessage(connection, call('7', 'StatusNotification', { status: 'Faulted' }));
    assert.equal(counter.status, 1);
    assert.deepEqual(connection.sent.map((frame) => frame[2]), [{ run: 1 }, { run: 1 }, { run: 1 }]);
  });

  it('cùng messageId, cùng nội dung (gửi lại): nhận câu cũ, handler chạy đúng một lần', async () => {
    const counter = newCounter();
    const server = makeServer({ counter });
    const connection = makeConnection();
    for (let i = 0; i < 3; i += 1) await server.handleMessage(connection, call('8', 'StatusNotification', { status: 'Available' }));
    assert.equal(counter.status, 1);
    assert.deepEqual(connection.sent.map((frame) => frame[2]), [{ run: 1 }, { run: 1 }, { run: 1 }]);
  });

  it('cùng nội dung sau hơn 10 phút vẫn phát lại trong thời gian retention', async () => {
    const counter = newCounter();
    const payload = { status: 'Available' };
    await query(
      "INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, response, created_at) VALUES ($1, '9', 'StatusNotification', $2, '{\"run\":99}', now() - interval '11 minutes')",
      [CODE, hashCall('StatusNotification', payload)]
    );
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('9', 'StatusNotification', payload));
    assert.equal(counter.status, 0);
    assert.deepEqual(connection.sent[0][2], { run: 99 });
  });

  it('cùng nội dung và còn trong retention thì phát lại câu cũ', async () => {
    const counter = newCounter();
    const payload = { status: 'Available' };
    await query(
      "INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, response, created_at) VALUES ($1, '10', 'StatusNotification', $2, '{\"run\":99}', now() - interval '9 minutes')",
      [CODE, hashCall('StatusNotification', payload)]
    );
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('10', 'StatusNotification', payload));
    assert.equal(counter.status, 0);
    assert.deepEqual(connection.sent[0][2], { run: 99 });
  });

  it('hai tin trùng song song trên bản ghi cũ vẫn phát lại câu đã lưu', async () => {
    const counter = newCounter();
    const payload = { status: 'Available' };
    await query(
      "INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, response, created_at) VALUES ($1, '11', 'StatusNotification', $2, '{\"run\":99}', now() - interval '11 minutes')",
      [CODE, hashCall('StatusNotification', payload)]
    );
    const a = makeServer({ counter, slow: 50 });
    const b = makeServer({ counter, slow: 50 });
    const connection = makeConnection();
    await Promise.all([
      a.handleMessage(connection, call('11', 'StatusNotification', payload)),
      b.handleMessage(connection, call('11', 'StatusNotification', payload)),
    ]);
    assert.equal(counter.status, 0);
    assert.equal(connection.sent.length, 2);
    assert.deepEqual(connection.sent.map((frame) => frame[2]), [{ run: 99 }, { run: 99 }]);
  });

  it('hai nội dung song song cùng id nhận response đầu, chỉ handler đầu chạy', async () => {
    const counter = newCounter();
    await query(
      "INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, response) VALUES ($1, '12', 'StatusNotification', 'old', '{\"run\":99}')",
      [CODE]
    );
    const server = makeServer({ counter, slow: 30 });
    const connection = makeConnection();
    await Promise.all([
      server.handleMessage(connection, call('12', 'StatusNotification', { status: 'Available' })),
      server.handleMessage(connection, call('12', 'StatusNotification', { status: 'Faulted' })),
    ]);
    assert.equal(counter.status, 0);
    assert.deepEqual(connection.sent.map((frame) => frame[2]), [{ run: 99 }, { run: 99 }]);
  });

  it('Heartbeat không sinh dòng trong ocpp_messages và không bị phát lại', async () => {
    const counter = newCounter();
    const server = makeServer({ counter });
    const connection = makeConnection();
    await server.handleMessage(connection, call('hb-1', 'Heartbeat', {}));
    await server.handleMessage(connection, call('hb-1', 'Heartbeat', {}));
    assert.equal(counter.heartbeat, 2);
    assert.equal((await query('SELECT count(*)::int AS n FROM ocpp_messages')).rows[0].n, 0);
  });
});
