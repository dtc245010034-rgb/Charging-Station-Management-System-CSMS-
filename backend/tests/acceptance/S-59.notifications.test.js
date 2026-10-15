const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, closePool } = require('../helpers/app');
const { query, run, resetSchema, truncateAll } = require('../helpers/db');
const { createUser } = require('../helpers/auth');
const { notifySessionEvent } = require('../../src/modules/notifications/notify');
const { runEmailBatch } = require('../../src/modules/notifications/email-job');
const { runIdleFeeNotificationBatch } = require('../../src/modules/notifications/idle-fee-notification-job');
const { pool } = require('../../src/db/pool');
const { finalizeSession } = require('../../src/modules/billing/finalize-session');
const { startServerProcess, stopServerProcess, stopAllServerProcesses, sendCall, bootChargePoint } = require('../helpers/server-process');

describe('S-59 notifications and email outbox', () => {
  let driver;
  let otherDriver;
  let sessionIds;
  let chargePointId;
  let connectorId;
  let server;
  let chargePoint;

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    driver = await createUser('driver-notifications@test.invalid', 'DRIVER');
    otherDriver = await createUser('other-notifications@test.invalid', 'DRIVER');
    const station = await query(
      `INSERT INTO stations (name, address, latitude, longitude, owner_id, timezone)
       VALUES ('Notification station', 'Test', 21, 105, $1, 'Asia/Ho_Chi_Minh') RETURNING id`,
      [driver.id]
    );
    const tariff = await query(
      `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
       VALUES ($1, 1, '2026-10-01', 0, 100) RETURNING id`,
      [station.rows[0].id]
    );
    await query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, 0, 1440, 1000, 'Test')`,
      [tariff.rows[0].id]
    );
    const chargePointRow = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'CP-NOTIFY-01') RETURNING id",
      [station.rows[0].id]
    );
    chargePointId = chargePointRow.rows[0].id;
    const connector = await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [chargePointId]
    );
    connectorId = connector.rows[0].id;
    sessionIds = [];
    for (let index = 0; index < 3; index += 1) {
      const session = await query(
        `INSERT INTO charging_sessions (
           charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
           meter_start, meter_stop, started_at, stopped_at, status
         ) VALUES ($1, $2, 1, $3, '***0001', 1000, 16000,
                   CURRENT_TIMESTAMP - INTERVAL '20 minutes',
                   CURRENT_TIMESTAMP - INTERVAL '5 minutes', 'COMPLETED')
         RETURNING id`,
        [chargePointId, connectorId, driver.id]
      );
      sessionIds.push(session.rows[0].id);
    }
    const activeSession = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, started_at, status
       ) VALUES ($1, $2, 1, $3, '***0001', 1000, CURRENT_TIMESTAMP, 'CHARGING')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    sessionIds.push(activeSession.rows[0].id);
  });

  after(async () => {
    chargePoint?.terminate();
    await stopServerProcess(server);
    await stopAllServerProcesses();
    await closePool();
    await resetSchema();
  });

  it('AC S-59: phiên kết thúc, dừng từ xa và bắt đầu phí chiếm trụ tạo thông báo kèm kWh, tạm tính', async () => {
    const kinds = ['SESSION_ENDED', 'SESSION_REMOTE_STOPPED', 'IDLE_FEE_STARTED'];
    await notifySessionEvent({ sessionId: sessionIds[0], kind: kinds[0] });
    await notifySessionEvent({ sessionId: sessionIds[1], kind: kinds[1] });

    const stopped = await query('SELECT stopped_at FROM charging_sessions WHERE id = $1', [sessionIds[2]]);
    const idleFrom = new Date(Date.parse(stopped.rows[0].stopped_at) + 1000);
    const idleTo = new Date(idleFrom.getTime() + 60_000);
    await query(
      `INSERT INTO connector_status_events (charge_point_id, connector_id, connector_no, ocpp_status, occurred_at)
       VALUES ($1, $2, 1, 'Finishing', $3), ($1, $2, 1, 'Available', $4)`,
      [chargePointId, connectorId, idleFrom.toISOString(), idleTo.toISOString()]
    );
    const finalized = await finalizeSession(sessionIds[2]);
    assert.equal(finalized.status, 'FINAL');
    assert.ok(finalized.invoice.lines.some((line) => line.kind === 'IDLE'));

    const notifications = await query(
      `SELECT kind, payload FROM notifications
       WHERE user_id = $1 ORDER BY kind`,
      [driver.id]
    );
    assert.deepStrictEqual(notifications.rows.map((row) => row.kind).sort(), [...kinds].sort());
    for (const row of notifications.rows) {
      assert.equal(row.payload.wh, '15000');
      assert.equal(row.payload.estimatedDong, 15000);
    }
    assert.equal(
      notifications.rows.find((row) => row.kind === 'IDLE_FEE_STARTED').payload.estimatedDong,
      15000,
      'Ước tính trong thông báo chỉ gồm tiền điện, không gồm phí chiếm trụ'
    );
    assert.equal((await query('SELECT count(*)::int AS n FROM email_outbox WHERE user_id = $1', [driver.id])).rows[0].n, 3);

    const noTariffStation = await query(
      `INSERT INTO stations (name, address, latitude, longitude, owner_id, timezone)
       VALUES ('No tariff station', 'Test', 21, 105, $1, 'Asia/Ho_Chi_Minh') RETURNING id`,
      [otherDriver.id]
    );
    const noTariffPoint = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'CP-NO-TARIFF') RETURNING id",
      [noTariffStation.rows[0].id]
    );
    const noTariffConnector = await query(
      'INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id',
      [noTariffPoint.rows[0].id]
    );
    const noTariffSession = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status
       ) VALUES ($1, $2, 1, $3, '***0002', 1000, 2600, CURRENT_TIMESTAMP - INTERVAL '10 minutes',
                 CURRENT_TIMESTAMP, 'COMPLETED') RETURNING id`,
      [noTariffPoint.rows[0].id, noTariffConnector.rows[0].id, otherDriver.id]
    );
    await notifySessionEvent({ sessionId: noTariffSession.rows[0].id, kind: 'SESSION_ENDED' });
    const noTariffNotification = await query(
      'SELECT payload FROM notifications WHERE session_id = $1',
      [noTariffSession.rows[0].id]
    );
    assert.equal(noTariffNotification.rows[0].payload.estimatedDong, null);
    const noTariffEmail = await query(
      "SELECT body FROM email_outbox WHERE user_id = $1 AND subject = 'Phiên sạc đã kết thúc'",
      [otherDriver.id]
    );
    assert.match(noTariffEmail.rows[0].body, /tạm tính: chưa có biểu giá/);

    const waitingIdleSession = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status,
         billing_status, billing_idle_from
       ) VALUES ($1, $2, 1, $3, '***0002', 1000, 2600, CURRENT_TIMESTAMP - INTERVAL '10 minutes',
                 CURRENT_TIMESTAMP - INTERVAL '2 minutes', 'COMPLETED', 'WAITING_IDLE',
                 CURRENT_TIMESTAMP - INTERVAL '2 minutes') RETURNING id`,
      [chargePointId, connectorId, otherDriver.id]
    );
    const idleNotifications = await runIdleFeeNotificationBatch({ db: pool });
    assert.equal(idleNotifications.notified, 1);
    assert.equal((await runIdleFeeNotificationBatch({ db: pool })).notified, 0);
    const idleNotification = await query(
      "SELECT kind FROM notifications WHERE session_id = $1",
      [waitingIdleSession.rows[0].id]
    );
    assert.equal(idleNotification.rows[0].kind, 'IDLE_FEE_STARTED');
    assert.equal((await query(
      'SELECT count(*)::int AS n FROM email_outbox WHERE user_id = $1 AND subject = $2',
      [otherDriver.id, 'Phiên sạc bắt đầu tính phí chiếm trụ']
    )).rows[0].n, 1);
  });

  it('AC S-59: sự kiện trùng không tạo email/thông báo trùng và API tài xế đọc/đánh dấu đã đọc', async () => {
    await notifySessionEvent({
      sessionId: sessionIds[0],
      kind: 'SESSION_ENDED',
    });
    const list = await request(app)
      .get('/api/me/notifications?unread=1')
      .set('Cookie', driver.cookie);
    assert.equal(list.status, 200);
    assert.equal(list.body.notifications.length, 3);
    assert.equal(list.body.unreadCount, 3);
    const foreignRead = await request(app)
      .post(`/api/me/notifications/${list.body.notifications[0].id}/read`)
      .set('Cookie', otherDriver.cookie)
      .send({});
    assert.equal(foreignRead.status, 404);
    assert.equal((await request(app)
      .get('/api/me/notifications?unread=invalid')
      .set('Cookie', driver.cookie)).status, 400);

    const read = await request(app)
      .post(`/api/me/notifications/${list.body.notifications[0].id}/read`)
      .set('Cookie', driver.cookie)
      .send({});
    assert.equal(read.status, 200);
    assert.equal(read.body.notification.readAt !== null, true);

    const emailLogs = [];
    const processed = await runEmailBatch({
      logInfo: (...args) => emailLogs.push(args.join(' ')),
    });
    assert.equal(processed.sent, 5);
    assert.equal(emailLogs.length, 5);
    assert.ok(emailLogs.every((line) => /^\[Email\] user_id=\d+ subject=/.test(line)));
    assert.ok(emailLogs.every((line) => !line.includes('driver-notifications@test.invalid')));

    await query(
      `INSERT INTO email_outbox (user_id, subject, body, attempts)
       VALUES ($1, 'Thử lại', 'Nội dung kiểm thử', 4)`,
      [driver.id]
    );
    const retryLogs = [];
    const retry = await runEmailBatch({
      transport: 'smtp',
      logError: (...args) => retryLogs.push(args.join(' ')),
    });
    assert.equal(retry.failed, 1);
    assert.ok(retryLogs.some((line) => line.includes('chưa được hỗ trợ')));
    const failedEmail = await query(
      "SELECT status, attempts FROM email_outbox WHERE subject = 'Thử lại'"
    );
    assert.equal(failedEmail.rows[0].status, 'FAILED');
    assert.equal(failedEmail.rows[0].attempts, 5);
  });

  it('AC S-59: StopTransaction từ xa vẫn chốt thành công và gửi thông báo qua OCPP server thật', async () => {
    server = await startServerProcess();
    chargePoint = await bootChargePoint(server.wsUrl, 'CP-NOTIFY-01');
    const timestamp = new Date().toISOString();
    const response = await sendCall(chargePoint, 'notification-stop-remote', 'StopTransaction', {
      transactionId: sessionIds[3],
      meterStop: 2000,
      timestamp,
      reason: 'Remote',
    });
    assert.deepStrictEqual(response, [3, 'notification-stop-remote', {}]);

    const deadline = Date.now() + 5000;
    let notification;
    while (Date.now() < deadline) {
      const result = await query(
        `SELECT kind, payload FROM notifications WHERE session_id = $1 AND kind = 'SESSION_REMOTE_STOPPED'`,
        [sessionIds[3]]
      );
      notification = result.rows[0];
      if (notification) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(notification, 'Remote StopTransaction phải tạo thông báo');
    assert.equal(Number(notification.payload.wh), 1000);
    assert.ok((await query(
      "SELECT 1 FROM email_outbox WHERE user_id = $1 AND subject = 'Phiên sạc đã bị dừng từ xa'",
      [driver.id]
    )).rowCount > 0);

    await query(`
      CREATE FUNCTION reject_notification_insert() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'notification write unavailable'; END;
      $$ LANGUAGE plpgsql
    `);
    await query('CREATE TRIGGER reject_notification_insert BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_notification_insert()');
    const secondSession = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, started_at, status
       ) VALUES ($1, $2, 1, $3, '***0001', 2000, CURRENT_TIMESTAMP, 'CHARGING')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );
    const failedNotificationResponse = await sendCall(chargePoint, 'notification-write-failure', 'StopTransaction', {
      transactionId: secondSession.rows[0].id,
      meterStop: 3000,
      timestamp: new Date().toISOString(),
      reason: 'Remote',
    });
    assert.deepStrictEqual(failedNotificationResponse, [3, 'notification-write-failure', {}]);
    const completed = await query('SELECT status FROM charging_sessions WHERE id = $1', [secondSession.rows[0].id]);
    assert.equal(completed.rows[0].status, 'COMPLETED');
    const notificationErrorDeadline = Date.now() + 5000;
    while (Date.now() < notificationErrorDeadline
      && !server.child.output.includes('[Notifications] Không thể tạo thông báo phiên:')) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(
      server.child.output.includes('[Notifications] Không thể tạo thông báo phiên:'),
      'Lỗi ghi thông báo phải được ghi log, sau khi StopTransaction đã hoàn tất'
    );
    await query('DROP TRIGGER reject_notification_insert ON notifications');
    await query('DROP FUNCTION reject_notification_insert()');
  });

  it('BUG-LOGIC-02: meter_stop < meter_start (số đo lùi) không sinh ra số âm trong thông báo/email', async () => {
    const rollbackSession = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
         meter_start, meter_stop, started_at, stopped_at, status
       ) VALUES ($1, $2, 1, $3, '***0001', 5000, 4500,
                 CURRENT_TIMESTAMP - INTERVAL '10 minutes',
                 CURRENT_TIMESTAMP, 'COMPLETED')
       RETURNING id`,
      [chargePointId, connectorId, driver.id]
    );

    const result = await notifySessionEvent({
      sessionId: rollbackSession.rows[0].id,
      kind: 'SESSION_ENDED',
    });
    assert.strictEqual(result.created, true);

    const notif = await query(
      'SELECT payload FROM notifications WHERE session_id = $1 AND kind = $2',
      [rollbackSession.rows[0].id, 'SESSION_ENDED']
    );
    assert.ok(notif.rows.length > 0);
    assert.strictEqual(notif.rows[0].payload.wh, null, 'wh phải là null khi số đo lùi');
    assert.strictEqual(notif.rows[0].payload.estimatedDong, null, 'estimatedDong phải là null');

    const email = await query(
      "SELECT body FROM email_outbox WHERE user_id = $1 AND subject = 'Phiên sạc đã kết thúc' ORDER BY id DESC LIMIT 1",
      [driver.id]
    );
    assert.ok(email.rows.length > 0);
    assert.ok(!email.rows[0].body.includes('-'), `Email không được chứa dấu trừ số âm: ${email.rows[0].body}`);
    assert.ok(!email.rows[0].body.includes('0.-'), `Email không được chứa 0.-: ${email.rows[0].body}`);
  });
});
