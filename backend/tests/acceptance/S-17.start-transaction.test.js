const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { run, query, resetSchema } = require('../helpers/db');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createMessageStore } = require('../../src/modules/ocpp/messages.repository');
const { createStartTransactionHandler } = require('../../src/modules/ocpp/handlers/start-transaction');

describe('S-17: StartTransaction creates charging sessions', () => {
  let pool;
  let connectorId;
  let logs;
  const CODE = 'CP-START-TRANSACTION';
  const VALID_TAG = 'TAG-VALID-1730';
  const BLOCKED_TAG = 'TAG-BLOCKED-1730';

  function makeConnection() {
    const sent = [];
    return {
      chargePointCode: CODE,
      isBootAccepted: true,
      send: (data, callback) => { sent.push(JSON.parse(data)); callback?.(); },
      sent,
    };
  }

  function makeServer() {
    return createOcppMessageHandler({
      handlers: { StartTransaction: createStartTransactionHandler({
        pool,
        logWarning: (message) => logs.push(message),
        logError: (message) => logs.push(message),
      }) },
      messageStore: createMessageStore(pool),
      logWarning: (message) => logs.push(message),
      logInfo: () => {},
      logError: (message) => logs.push(message),
    });
  }

  const call = (messageId, payload) => JSON.stringify([2, messageId, 'StartTransaction', payload]);
  const payload = (overrides = {}) => ({
    connectorId: 1,
    idTag: VALID_TAG,
    meterStart: 123456,
    timestamp: '2030-10-07T10:00:00.000Z',
    ...overrides,
  });

  before(async () => {
    await resetSchema();
    const migration = run('src/db/migrate.js');
    assert.equal(migration.status, 0, `${migration.stdout}\n${migration.stderr}`);
    pool = new Pool({ connectionString: require('../helpers/db').BASE });

    const user = await query("INSERT INTO users (name, email, password_hash) VALUES ('S17 Driver', 's17-driver@test.local', 'hash') RETURNING id");
    const station = await query("INSERT INTO stations (name, address, latitude, longitude, status, owner_id) VALUES ('S17 Station', 'Test', 21, 105, 'ACTIVE', $1) RETURNING id", [user.rows[0].id]);
    const chargePoint = await query("INSERT INTO charge_points (station_id, code, status) VALUES ($1, $2, 'ONLINE') RETURNING id", [station.rows[0].id, CODE]);
    const connector = await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id', [chargePoint.rows[0].id]);
    connectorId = connector.rows[0].id;
    await query('INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 2)', [chargePoint.rows[0].id]);
    await query("INSERT INTO id_tags (tag, user_id, status) VALUES ($1, $2, 'ACTIVE'), ($3, $2, 'BLOCKED')", [VALID_TAG, user.rows[0].id, BLOCKED_TAG]);
  });

  after(async () => {
    await pool.end();
    await resetSchema();
  });

  it('AC1: creates a charging session with DB transactionId and exact starting meter/time', async () => {
    logs = [];
    const connection = makeConnection();
    await makeServer().handleMessage(connection, call('s17-valid', payload()));

    const response = connection.sent[0];
    assert.equal(response[0], 3);
    assert.equal(response[2].idTagInfo.status, 'Accepted');
    assert.ok(Number.isInteger(response[2].transactionId));
    const session = await query('SELECT * FROM charging_sessions WHERE id = $1', [response[2].transactionId]);
    assert.equal(session.rows[0].connector_id, connectorId);
    assert.equal(Number(session.rows[0].meter_start), 123456);
    assert.equal(new Date(session.rows[0].started_at).toISOString(), '2030-10-07T10:00:00.000Z');
    assert.equal(session.rows[0].status, 'CHARGING');
  });

  it('AC2: blocked and unknown tags still get transactionIds and NEEDS_REVIEW sessions', async () => {
    logs = [];
    const connection = makeConnection();
    const server = makeServer();
    await server.handleMessage(connection, call('s17-blocked', payload({ idTag: BLOCKED_TAG, timestamp: '2026-10-07T10:01:00Z' })));
    await server.handleMessage(connection, call('s17-unknown', payload({ connectorId: 2, idTag: 'UNKNOWN-1730', timestamp: '2026-10-07T10:02:00Z' })));

    assert.deepEqual(connection.sent.map((frame) => frame[2].idTagInfo.status), ['Blocked', 'Invalid']);
    const ids = connection.sent.map((frame) => frame[2].transactionId);
    assert.ok(ids.every(Number.isInteger));
    const sessions = await query('SELECT id, status, id_tag_id, id_tag_masked FROM charging_sessions WHERE id = ANY($1::int[]) ORDER BY id', [ids]);
    assert.equal(sessions.rowCount, 2);
    assert.ok(sessions.rows.every((session) => session.status === 'NEEDS_REVIEW'));
    assert.ok(sessions.rows.some((session) => session.id_tag_id === null && session.id_tag_masked.endsWith('1730')));
  });

  it('AC3: closes a previous open session abnormally and warns before creating the next one', async () => {
    logs = [];
    const connection = makeConnection();
    const server = makeServer();
    await server.handleMessage(connection, call('s17-replace-1', payload({ timestamp: '2026-10-07T10:03:00Z' })));
    await server.handleMessage(connection, call('s17-replace-2', payload({ timestamp: '2026-10-07T10:04:00Z', meterStart: 123500 })));

    const transactionIds = connection.sent.map((frame) => frame[2].transactionId);
    const rows = await query(
      'SELECT status, meter_stop, stop_reason FROM charging_sessions WHERE id = ANY($1::int[]) ORDER BY id',
      [transactionIds]
    );
    assert.deepEqual(rows.rows.map((row) => row.status), ['ABNORMAL', 'CHARGING']);
    assert.equal(rows.rows[0].meter_stop, null);
    assert.equal(rows.rows[0].stop_reason, 'START_TRANSACTION_REPLACED');
    assert.ok(logs.some((message) => message.includes('REPLACED_OPEN_SESSION')));
  });

  it('AC4: duplicate messageId replays the original transactionId without creating another session', async () => {
    logs = [];
    const connection = makeConnection();
    const server = makeServer();
    const frame = call('s17-replay', payload({ timestamp: '2026-10-07T10:05:00Z' }));
    await server.handleMessage(connection, frame);
    await server.handleMessage(connection, frame);

    assert.equal(connection.sent.length, 2);
    assert.equal(connection.sent[0][2].transactionId, connection.sent[1][2].transactionId);
    const count = await query("SELECT count(*)::int AS count FROM charging_sessions WHERE started_at = '2026-10-07T10:05:00Z'");
    assert.equal(count.rows[0].count, 1);
  });
});