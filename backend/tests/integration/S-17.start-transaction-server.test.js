const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { closePool } = require('../helpers/app');
const { query, resetSchema, truncateAll, run: runScript } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { stationBody, postStation } = require('../helpers/station');
const {
  startServerProcess,
  stopServerProcess,
  stopAllServerProcesses,
  sendCall,
  bootChargePoint,
} = require('../helpers/server-process');
const { maskIdTag } = require('../../src/modules/ocpp/handlers/authorize');

const CODE = 'CP-START-TX-01';

describe('S-17 StartTransaction trên WebSocket server thật (GYM-43)', () => {
  let server;
  let client;
  let owner;
  let driverUserId;
  let cpId;
  let connector1Id;

  const TAG_ACTIVE = 'TAG-ST-ACTIVE';
  const TAG_BLOCKED = 'TAG-ST-BLOCKED';

  before(async () => {
    await resetSchema();
    assert.strictEqual(runScript('src/db/migrate.js').status, 0);
    await truncateAll();

    owner = await createUser('owner-st-tx@test.invalid', 'STATION_OWNER');
    const userRes = await query("INSERT INTO users (name, email, password_hash) VALUES ('Driver ST', 'driver-st@test.local', 'hash') RETURNING id");
    driverUserId = userRes.rows[0].id;

    const stationId = (await postStation(owner, stationBody({ name: 'Station ST-TX' }))).body.id;
    await query("UPDATE stations SET status = 'ACTIVE' WHERE id = $1", [stationId]);

    const cpRes = await query(
      "INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'UNKNOWN') RETURNING id",
      [stationId, CODE]
    );
    cpId = cpRes.rows[0].id;

    const c1Res = await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 1, 'AVAILABLE', 'Available') RETURNING id",
      [cpId]
    );
    connector1Id = c1Res.rows[0].id;

    await query(
      "INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, 2, 'AVAILABLE', 'Available')",
      [cpId]
    );

    await query("INSERT INTO id_tags (tag, user_id, status, expires_at) VALUES ($1, $2, 'ACTIVE', NULL)", [TAG_ACTIVE, driverUserId]);
    await query("INSERT INTO id_tags (tag, user_id, status, expires_at) VALUES ($1, $2, 'BLOCKED', NULL)", [TAG_BLOCKED, driverUserId]);

    server = await startServerProcess();
    client = await bootChargePoint(server.wsUrl, CODE);
  });

  after(async () => {
    client?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
    runScript('src/db/migrate.js');
  });

  let firstTxId;
  const scenarioStartTime = Date.now() - 30 * 60 * 1000;
  const scenarioTime = (minutesAfterStart) => new Date(
    scenarioStartTime + minutesAfterStart * 60 * 1000
  ).toISOString();
  const startTime = scenarioTime(0);

  it('AC1: Thẻ hợp lệ + đầu nối rảnh -> phiên CHARGING, Accepted, cấp transactionId', async () => {
    const res = await sendCall(client, 'msg-start-01', 'StartTransaction', {
      connectorId: 1,
      idTag: TAG_ACTIVE,
      meterStart: 1000,
      timestamp: startTime,
    });

    assert.strictEqual(res[0], 3, 'Phải là CALLRESULT');
    assert.strictEqual(res[1], 'msg-start-01');
    assert.strictEqual(res[2].idTagInfo.status, 'Accepted');
    assert.strictEqual(typeof res[2].transactionId, 'number');
    firstTxId = res[2].transactionId;

    const sessionRes = await query('SELECT * FROM charging_sessions WHERE id = $1', [firstTxId]);
    assert.strictEqual(sessionRes.rowCount, 1);
    const session = sessionRes.rows[0];
    assert.strictEqual(session.connector_id, connector1Id);
    assert.strictEqual(session.connector_no, 1);
    assert.strictEqual(session.status, 'CHARGING');
    assert.strictEqual(Number(session.meter_start), 1000);
    assert.strictEqual(session.needs_review, false);
    assert.strictEqual(session.id_tag_masked, maskIdTag(TAG_ACTIVE));
    assert.strictEqual(session.driver_id, driverUserId);
  });

  it('AC4 (S-14): Gửi lại cùng messageId -> nhận lại cùng transactionId cũ', async () => {
    const res = await sendCall(client, 'msg-start-01', 'StartTransaction', {
      connectorId: 1,
      idTag: TAG_ACTIVE,
      meterStart: 1000,
      timestamp: startTime,
    });

    assert.strictEqual(res[0], 3);
    assert.strictEqual(res[2].transactionId, firstTxId);
    assert.strictEqual(res[2].idTagInfo.status, 'Accepted');

    const countRes = await query('SELECT COUNT(*) AS total FROM charging_sessions WHERE connector_id = $1', [connector1Id]);
    assert.strictEqual(Number(countRes.rows[0].total), 1, 'Không được sinh thêm dòng trong charging_sessions');
  });

  it('D4: Gửi lại cùng nội dung nhưng khác messageId -> cùng transactionId, không tạo phiên thứ 2', async () => {
    const res = await sendCall(client, 'msg-start-other-id', 'StartTransaction', {
      connectorId: 1,
      idTag: TAG_ACTIVE,
      meterStart: 1000,
      timestamp: startTime,
    });

    assert.strictEqual(res[0], 3);
    assert.strictEqual(res[2].transactionId, firstTxId);

    const countRes = await query('SELECT COUNT(*) AS total FROM charging_sessions WHERE connector_id = $1', [connector1Id]);
    assert.strictEqual(Number(countRes.rows[0].total), 1);
  });

  it('AC2: Thẻ khoá (Blocked) -> vẫn cấp transactionId, idTagInfo: Blocked, needs_review = true', async () => {
    const blockedStartTime = scenarioTime(10);
    const res = await sendCall(client, 'msg-start-blocked', 'StartTransaction', {
      connectorId: 2,
      idTag: TAG_BLOCKED,
      meterStart: 500,
      timestamp: blockedStartTime,
    });

    assert.strictEqual(res[0], 3);
    assert.strictEqual(res[2].idTagInfo.status, 'Blocked');
    const blockedTxId = res[2].transactionId;
    assert.strictEqual(typeof blockedTxId, 'number');

    const sRes = await query('SELECT * FROM charging_sessions WHERE id = $1', [blockedTxId]);
    const s = sRes.rows[0];
    assert.strictEqual(s.needs_review, true);
    assert.match(s.review_reason, /Tag status: Blocked/);
  });

  it('AC2: Thẻ không tồn tại (Invalid) -> vẫn cấp transactionId, idTagInfo: Invalid, needs_review = true', async () => {
    const invalidStartTime = scenarioTime(15);
    const invalidTag = 'TAG-UNKNOWN-999';
    const res = await sendCall(client, 'msg-start-invalid', 'StartTransaction', {
      connectorId: 2,
      idTag: invalidTag,
      meterStart: 600,
      timestamp: invalidStartTime,
    });

    assert.strictEqual(res[0], 3);
    assert.strictEqual(res[2].idTagInfo.status, 'Invalid');
    const invalidTxId = res[2].transactionId;

    const sRes = await query('SELECT * FROM charging_sessions WHERE id = $1', [invalidTxId]);
    const s = sRes.rows[0];
    assert.strictEqual(s.needs_review, true);
    assert.match(s.review_reason, /Tag status: Invalid/);
    assert.strictEqual(s.driver_id, null);
    assert.strictEqual(s.id_tag_id, null);
    assert.strictEqual(s.id_tag_masked, maskIdTag(invalidTag));
  });

  it('AC3: Đầu nối còn phiên CHARGING cũ -> phiên cũ đóng ABNORMAL, phiên mới tạo CHARGING', async () => {
    // Connector 1 hiện đang có firstTxId ở trạng thái CHARGING
    const newStartTime = scenarioTime(30);
    const res = await sendCall(client, 'msg-start-replace', 'StartTransaction', {
      connectorId: 1,
      idTag: TAG_ACTIVE,
      meterStart: 2500,
      timestamp: newStartTime,
    });

    assert.strictEqual(res[0], 3);
    assert.strictEqual(res[2].idTagInfo.status, 'Accepted');
    const newTxId = res[2].transactionId;
    assert.notStrictEqual(newTxId, firstTxId);

    // Phiên cũ phải chuyển sang ABNORMAL
    const oldSessionRes = await query('SELECT * FROM charging_sessions WHERE id = $1', [firstTxId]);
    const oldSession = oldSessionRes.rows[0];
    assert.strictEqual(oldSession.status, 'ABNORMAL');
    assert.strictEqual(oldSession.needs_review, true);
    assert.strictEqual(oldSession.meter_stop, null, 'kWh của phiên cũ bị đóng bất thường phải để trống');

    // Phiên mới là CHARGING
    const newSessionRes = await query('SELECT * FROM charging_sessions WHERE id = $1', [newTxId]);
    const newSession = newSessionRes.rows[0];
    assert.strictEqual(newSession.status, 'CHARGING');
    assert.strictEqual(Number(newSession.meter_start), 2500);
  });

  it('Q2: connectorId chưa khai báo -> ghi orphan_messages (đã che idTag), trả PropertyConstraintViolation', async () => {
    const rawTag = 'TAG-UNDEC-888';
    const res = await sendCall(client, 'msg-start-undeclared', 'StartTransaction', {
      connectorId: 99,
      idTag: rawTag,
      meterStart: 0,
      timestamp: startTime,
    });

    assert.strictEqual(res[0], 4, 'Phải là CALLERROR');
    assert.strictEqual(res[2], 'PropertyConstraintViolation');
    assert.match(res[3], /Connector 99 is undeclared/);

    const orphanRes = await query(
      "SELECT * FROM orphan_messages WHERE charge_point_id = $1 AND action = 'StartTransaction' ORDER BY id DESC LIMIT 1",
      [cpId]
    );
    assert.strictEqual(orphanRes.rowCount, 1);
    const orphan = orphanRes.rows[0];
    assert.match(orphan.reason, /Undeclared connectorId: 99/);
    const savedPayload = orphan.payload;
    assert.strictEqual(savedPayload.idTag, maskIdTag(rawTag), 'Mã thẻ trong orphan_messages phải được che');
    assert.ok(!JSON.stringify(savedPayload).includes(rawTag), 'Không được lưu mã thẻ thô');
  });

  it('meterStart vượt quá safe integer (1e20) -> trả CALLERROR FormationViolation', async () => {
    const res = await sendCall(client, 'msg-start-huge-meter', 'StartTransaction', {
      connectorId: 1,
      idTag: TAG_ACTIVE,
      meterStart: 1e20,
      timestamp: startTime,
    });

    assert.strictEqual(res[0], 4, 'Phải là CALLERROR');
    assert.strictEqual(res[2], 'FormationViolation');
  });

  it('D6 + D4: Đồng hồ trụ về 1970 rồi gửi lại với messageId mới không sinh phiên ma', async () => {
    const timestamp1970 = '1970-01-01T00:00:00.000Z';
    // Lần 1 trên connector 2
    const res1 = await sendCall(client, 'msg-start-1970-1', 'StartTransaction', {
      connectorId: 2,
      idTag: TAG_ACTIVE,
      meterStart: 0,
      timestamp: timestamp1970,
    });
    assert.strictEqual(res1[0], 3);
    const tx1 = res1[2].transactionId;

    // Lần 2 với messageId mới
    const res2 = await sendCall(client, 'msg-start-1970-2', 'StartTransaction', {
      connectorId: 2,
      idTag: TAG_ACTIVE,
      meterStart: 0,
      timestamp: timestamp1970,
    });
    assert.strictEqual(res2[0], 3);
    assert.strictEqual(res2[2].transactionId, tx1, 'Phải nhận lại đúng transactionId ban đầu');

    // Kiểm tra DB chỉ có 1 phiên có started_at = 1970
    const countRes = await query(
      "SELECT COUNT(*) AS total FROM charging_sessions WHERE started_at = '1970-01-01 00:00:00+00'",
      []
    );
    assert.strictEqual(Number(countRes.rows[0].total), 1, 'Không được tạo phiên ma thứ 2');
  });
});
