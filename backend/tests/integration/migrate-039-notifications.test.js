const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema } = require('../helpers/db');

describe('migration 039: notifications and email_outbox [GYM-85]', () => {
  before(async () => {
    await resetSchema();
    const migrated = run('src/db/migrate.js');
    assert.strictEqual(migrated.status, 0, migrated.stderr);
  });
  after(resetSchema);

  it('AC GYM-85: bảng notifications và email_outbox tồn tại với đầy đủ cột và ràng buộc', async () => {
    const notifyRes = await query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications'"
    );
    assert.strictEqual(notifyRes.rowCount, 1, 'notifications phải tồn tại');

    const emailRes = await query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_outbox'"
    );
    assert.strictEqual(emailRes.rowCount, 1, 'email_outbox phải tồn tại');

    // Tạo driver và session để test foreign key
    const driver = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ('Driver Notify', 'driver-notify-m039@test.invalid', 'hash') RETURNING id"
    );
    const driverId = driver.rows[0].id;

    const station = await query(
      "INSERT INTO stations (name, address, latitude, longitude, owner_id) VALUES ('Trạm N', 'HN', 21.0, 105.0, $1) RETURNING id",
      [driverId]
    );
    const cp = await query(
      "INSERT INTO charge_points (station_id, code) VALUES ($1, 'CP-M039-01') RETURNING id",
      [station.rows[0].id]
    );
    const conn = await query(
      "INSERT INTO connectors (charge_point_id, connector_no) VALUES ($1, 1) RETURNING id",
      [cp.rows[0].id]
    );
    const sess = await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, driver_id, id_tag_masked, meter_start, started_at, status
       ) VALUES ($1, $2, 1, $3, 'TAG039', 0, CURRENT_TIMESTAMP, 'COMPLETED') RETURNING id`,
      [cp.rows[0].id, conn.rows[0].id, driverId]
    );
    const sessionId = sess.rows[0].id;

    // 1. Chèn thông báo hợp lệ
    const insertedNotification = await query(
      `INSERT INTO notifications (user_id, kind, session_id, payload)
       VALUES ($1, 'SESSION_ENDED', $2, '{"wh": 15000, "estimatedDong": 60000}')
       RETURNING *`,
      [driverId, sessionId]
    );
    assert.strictEqual(insertedNotification.rowCount, 1);
    assert.strictEqual(insertedNotification.rows[0].kind, 'SESSION_ENDED');
    assert.deepStrictEqual(insertedNotification.rows[0].payload, { wh: 15000, estimatedDong: 60000 });

    // 2. Chặn trùng (session_id, kind)
    await assert.rejects(
      query(
        `INSERT INTO notifications (user_id, kind, session_id, payload)
         VALUES ($1, 'SESSION_ENDED', $2, '{"wh": 15000, "estimatedDong": 60000}')`,
        [driverId, sessionId]
      ),
      (err) => err.code === '23505' // unique violation
    );

    // 3. Cho phép cùng session_id nhưng khác kind
    const remoteStopped = await query(
      `INSERT INTO notifications (user_id, kind, session_id, payload)
       VALUES ($1, 'SESSION_REMOTE_STOPPED', $2, '{"wh": 15000, "estimatedDong": 60000}')
       RETURNING *`,
      [driverId, sessionId]
    );
    assert.strictEqual(remoteStopped.rowCount, 1);

    // 4. Chặn kind không hợp lệ
    await assert.rejects(
      query(
        `INSERT INTO notifications (user_id, kind, session_id, payload)
         VALUES ($1, 'INVALID_KIND', $2, '{}')`,
        [driverId, sessionId]
      ),
      (err) => err.code === '23514' // check violation
    );

    // 5. Chèn email_outbox hợp lệ
    const insertedEmail = await query(
      `INSERT INTO email_outbox (user_id, subject, body, status)
       VALUES ($1, 'Phiên sạc hoàn tất', 'Bạn đã sạc 15 kWh...', 'PENDING')
       RETURNING *`,
      [driverId]
    );
    assert.strictEqual(insertedEmail.rowCount, 1);
    assert.strictEqual(insertedEmail.rows[0].status, 'PENDING');
    assert.strictEqual(insertedEmail.rows[0].attempts, 0);

    // 6. Chặn email status không hợp lệ
    await assert.rejects(
      query(
        `INSERT INTO email_outbox (user_id, subject, body, status)
         VALUES ($1, 'Tiêu đề', 'Nội dung', 'INVALID_STATUS')`,
        [driverId]
      ),
      (err) => err.code === '23514' // check violation
    );
  });

  it('AC GYM-85: rollback migration 039 gỡ sạch bảng notifications và email_outbox và up lại được', async () => {
    while ((await query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1')).rows[0]?.version === '039_notifications_and_email_outbox.sql') {
      const down = run('src/db/migrate.js', ['down']);
      assert.strictEqual(down.status, 0, down.stderr);
    }

    const tableAfterDown = await query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('notifications', 'email_outbox')"
    );
    assert.strictEqual(tableAfterDown.rowCount, 0, 'notifications và email_outbox phải bị xóa sau down');

    const up = run('src/db/migrate.js');
    assert.strictEqual(up.status, 0, up.stderr);

    const tableAfterUp = await query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('notifications', 'email_outbox')"
    );
    assert.strictEqual(tableAfterUp.rowCount, 2, 'notifications và email_outbox phải tồn tại sau up lại');
  });
});
