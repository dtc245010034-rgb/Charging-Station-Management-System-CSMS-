const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { BASE, run, query, resetSchema } = require('../helpers/db');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createMessageStore } = require('../../src/modules/ocpp/messages.repository');

const CHARGE_POINT_CODE = 'S14-ACCEPTANCE-CP';

describe('S-14: Tin nhắn trùng mã nhận lại đúng câu trả lời cũ, không xử lý hai lần', () => {
  let pool;
  let logs;

  function makeConnection(code = CHARGE_POINT_CODE) {
    const sent = [];
    return {
      chargePointCode: code,
      isBootAccepted: true,
      send: (data, callback) => {
        sent.push(JSON.parse(data));
        callback?.();
      },
      sent,
    };
  }

  function makeServer({ counter, slow = 0 } = {}) {
    return createOcppMessageHandler({
      handlers: {
        StartTransaction: async () => {
          counter.n += 1;
          if (slow > 0) await new Promise((resolve) => setTimeout(resolve, slow));
          return { transactionId: counter.n, idTagInfo: { status: 'Accepted' } };
        },
        StatusNotification: async () => {
          counter.statusCount += 1;
          return {};
        },
      },
      messageStore: createMessageStore(pool),
      logWarning: (line) => logs.push(line),
      logError: () => {},
      logInfo: () => {},
    });
  }

  const callFrame = (messageId, action, payload) => JSON.stringify([2, messageId, action, payload]);

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    pool = new Pool({ connectionString: BASE });
  });

  after(async () => {
    await pool.end();
    await resetSchema();
  });

  beforeEach(async () => {
    logs = [];
    await query('TRUNCATE ocpp_messages');
  });

  it('AC1: trụ gửi lại cùng một tin nhắn với cùng mã tin nhắn 5 lần → chỉ xử lý 1 lần, 5 lần nhận cùng câu trả lời', async () => {
    const counter = { n: 0, statusCount: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();

    for (let i = 0; i < 5; i += 1) {
      await server.handleMessage(connection, callFrame('msg-dup-5', 'StartTransaction', { idTag: 'TAG-AC1' }));
    }

    assert.equal(counter.n, 1, 'Handler chỉ được gọi đúng 1 lần duy nhất');
    assert.equal(connection.sent.length, 5, 'Hệ thống phải trả về đủ 5 câu phản hồi');
    const transactionIds = connection.sent.map((frame) => frame[2].transactionId);
    assert.deepEqual(transactionIds, [1, 1, 1, 1, 1], 'Cả 5 câu trả lời đều mang cùng một transactionId của lần đầu');

    const dbRows = (await query("SELECT count(*)::int AS n FROM ocpp_messages WHERE charge_point_code = $1 AND message_id = 'msg-dup-5'", [CHARGE_POINT_CODE])).rows[0].n;
    assert.equal(dbRows, 1, 'Trong bảng ocpp_messages chỉ được lưu đúng 1 dòng');
  });

  it('AC2: tiến trình khởi động lại giữa 2 lần gửi → vẫn nhận ra trùng do lưu DB, không chạy lại handler', async () => {
    const counter = { n: 0, statusCount: 0 };
    const firstConnection = makeConnection();
    await makeServer({ counter }).handleMessage(
      firstConnection,
      callFrame('msg-restart', 'StartTransaction', { idTag: 'TAG-RESTART' })
    );

    // Mô phỏng tiến trình khởi động lại: tạo instance server mới với bộ nhớ hoàn toàn mới
    const secondConnection = makeConnection();
    await makeServer({ counter }).handleMessage(
      secondConnection,
      callFrame('msg-restart', 'StartTransaction', { idTag: 'TAG-RESTART' })
    );

    assert.equal(counter.n, 1, 'Handler không được chạy lại sau khi khởi động lại tiến trình');
    assert.deepEqual(secondConnection.sent[0][2], firstConnection.sent[0][2], 'Câu trả lời trả về sau khi restart phải khớp hoàn toàn');
  });

  it('AC3: hai tin nhắn khác nội dung nhưng trùng mã → xử lý an toàn theo F8, không làm lộ payload trong log', async () => {
    const counter = { n: 0, statusCount: 0 };
    const server = makeServer({ counter });
    const connection = makeConnection();

    await server.handleMessage(connection, callFrame('msg-diff', 'StartTransaction', { idTag: 'TAG-INITIAL' }));
    await server.handleMessage(connection, callFrame('msg-diff', 'StartTransaction', { idTag: 'SECRET-RFID-TAG' }));

    assert.equal(counter.n, 2, 'Theo quy tắc F8, khác payload/action được xử lý như tin mới sau khi trụ reboot');
    assert.notDeepEqual(connection.sent[1][2], connection.sent[0][2]);

    const joinedLogs = logs.join('\n');
    assert.ok(!joinedLogs.includes('SECRET-RFID-TAG'), 'Tuyệt đối không log thông tin thẻ thô/payload bí mật');
  });

  it('AC4: bản ghi quá hạn 7 ngày bị job dọn xoá, bản ghi mới được giữ', async () => {
    const store = createMessageStore(pool);
    await query(`
      INSERT INTO ocpp_messages (charge_point_code, message_id, action, payload_hash, response, created_at)
      VALUES 
        ('CP-S14', 'msg-old-8d', 'StatusNotification', 'h1', '{}', now() - interval '8 days'),
        ('CP-S14', 'msg-new-5d', 'StatusNotification', 'h2', '{}', now() - interval '5 days')
    `);

    const deletedCount = await store.purgeOlderThan(7);
    assert.equal(deletedCount, 1, 'Job dọn phải xoá đúng 1 bản ghi cũ hơn 7 ngày');

    const remainingRows = (await query("SELECT message_id FROM ocpp_messages WHERE charge_point_code = 'CP-S14'")).rows.map((r) => r.message_id);
    assert.deepEqual(remainingRows, ['msg-new-5d'], 'Bản ghi mới hơn 7 ngày phải được giữ nguyên');
  });

  it('NFR Concurrency: hai tin trùng tới đồng thời → chỉ một bên chạy handler, cả hai nhận cùng câu trả lời', async () => {
    const counter = { n: 0, statusCount: 0 };
    const server = makeServer({ counter, slow: 40 });
    const connection = makeConnection();

    await Promise.all([
      server.handleMessage(connection, callFrame('msg-race', 'StartTransaction', { idTag: 'TAG-RACE' })),
      server.handleMessage(connection, callFrame('msg-race', 'StartTransaction', { idTag: 'TAG-RACE' })),
      server.handleMessage(connection, callFrame('msg-race', 'StartTransaction', { idTag: 'TAG-RACE' })),
    ]);

    assert.equal(counter.n, 1, 'Handler chỉ được gọi đúng 1 lần dù nhiều tin nhắn tới đồng thời');
    assert.equal(connection.sent.length, 3, 'Cả 3 request đều nhận được phản hồi');
    const returnedTxIds = new Set(connection.sent.map((f) => f[2].transactionId));
    assert.equal(returnedTxIds.size, 1, 'Tất cả request đồng thời đều nhận cùng 1 kết quả');
  });

  it('NFR Multi-tenant: hai trụ khác nhau dùng cùng messageId được xử lý độc lập', async () => {
    const counter = { n: 0, statusCount: 0 };
    const server = makeServer({ counter });

    await server.handleMessage(makeConnection('CP-STATION-ALPHA'), callFrame('shared-id-1', 'StartTransaction', {}));
    await server.handleMessage(makeConnection('CP-STATION-BETA'), callFrame('shared-id-1', 'StartTransaction', {}));

    assert.equal(counter.n, 2, 'Hai trụ khác nhau có cùng messageId phải được xử lý độc lập');
  });
});
