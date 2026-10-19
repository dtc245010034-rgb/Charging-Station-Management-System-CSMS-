const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { closePool } = require('../helpers/app');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { createUser } = require('../helpers/auth');
const { expireReservationsOnce } = require('../../src/modules/reservations/expiry-job');

describe('S-50: Hết hạn đặt chỗ và trừ phí không đến (Bảng R01–R07)', { concurrency: false }, () => {
  let driver;
  let stationId;
  let connectorId;
  let chargePointId;
  const CHARGE_POINT_CODE = 'CP-S50-TEST';

  before(async () => {
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    const owner = await createUser('s50-owner@test.invalid', 'STATION_OWNER');
    driver = await createUser('s50-driver@test.invalid', 'DRIVER');

    const stRes = await query(
      `INSERT INTO stations (name, address, latitude, longitude, status, owner_id, no_show_fee_dong)
       VALUES ('Trạm S-50 Test', 'Hà Nội', 21.0, 105.8, 'ACTIVE', $1, 20000)
       RETURNING id`,
      [owner.id]
    );
    stationId = stRes.rows[0].id;

    const cpRes = await query(
      `INSERT INTO charge_points (station_id, code, status)
       VALUES ($1, $2, 'ONLINE')
       RETURNING id`,
      [stationId, CHARGE_POINT_CODE]
    );
    chargePointId = cpRes.rows[0].id;

    const connRes = await query(
      `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
       VALUES ($1, 1, 'AVAILABLE', 'Available')
       RETURNING id`,
      [chargePointId]
    );
    connectorId = connRes.rows[0].id;

    await query(
      `INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-S50', $1, 'ACTIVE')`,
      [driver.id]
    );
  });

  after(async () => {
    await truncateAll();
    await closePool();
  });

  it('R01: Chỗ ACCEPTED hết hạn, không có phiên; ví 50 000 -> EXPIRED, 1 dòng RESERVATION_FEE -20 000, balance_after 30 000, audit, gửi CancelReservation 1 lần', async () => {
    // Nạp ví 50 000
    await withTransaction((client) => postEntry(client, {
      driverId: driver.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 50000,
      receiptCode: `R01-TOPUP-${Date.now()}`,
    }));

    const startsAt = new Date(Date.now() - 3600000).toISOString();
    const expiresAt = new Date(Date.now() - 1800000).toISOString();

    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 101, 'ACCEPTED', $3, $4, 20000)
       RETURNING id`,
      [driver.id, connectorId, startsAt, expiresAt]
    );
    const reservationId = resInsert.rows[0].id;

    const cancelCommands = [];
    const mockCommandSender = {
      send: async (code, action, payload) => {
        cancelCommands.push({ code, action, payload });
        return { status: 'Accepted' };
      },
    };

    const runResult = await expireReservationsOnce({
      commandSender: mockCommandSender,
      now: new Date(),
    });

    assert.ok(runResult.expired >= 1);

    // Kiểm tra trạng thái đặt chỗ
    const updatedRes = await query('SELECT status, cancel_status FROM reservations WHERE id = $1', [reservationId]);
    assert.equal(updatedRes.rows[0].status, 'EXPIRED');
    assert.equal(updatedRes.rows[0].cancel_status, 'SENT');

    // Kiểm tra sổ cái: đúng 1 dòng RESERVATION_FEE -20 000, balance_after = 30 000
    const ledger = await query(
      `SELECT entry_type, amount_dong, balance_after_dong
       FROM wallet_ledger
       WHERE reservation_id = $1`,
      [reservationId]
    );
    assert.equal(ledger.rowCount, 1);
    assert.equal(ledger.rows[0].entry_type, 'RESERVATION_FEE');
    assert.equal(ledger.rows[0].amount_dong, '-20000');
    assert.equal(ledger.rows[0].balance_after_dong, '30000');

    // Kiểm tra số dư ví
    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id]);
    assert.equal(wallet.rows[0].balance_dong, '30000');

    // Kiểm tra audit log
    const auditRes = await query(
      `SELECT action, entity, entity_id FROM audit_logs WHERE action = 'RESERVATION_EXPIRED' AND entity_id = $1`,
      [reservationId]
    );
    assert.equal(auditRes.rowCount, 1);

    // Kiểm tra CancelReservation gửi 1 lần
    assert.equal(cancelCommands.length, 1);
    assert.equal(cancelCommands[0].action, 'CancelReservation');
    assert.equal(cancelCommands[0].payload.reservationId, 101);
  });

  it('R02: Chạy job quá hạn thêm 3 lần -> Vẫn 1 dòng sổ cái, số dư 30 000', async () => {
    const cancelCommands = [];
    const mockCommandSender = {
      send: async (code, action, payload) => {
        cancelCommands.push({ code, action, payload });
        return { status: 'Accepted' };
      },
    };

    for (let i = 0; i < 3; i++) {
      await expireReservationsOnce({
        commandSender: mockCommandSender,
        now: new Date(),
      });
    }

    const ledger = await query(
      `SELECT count(*)::int AS count FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'RESERVATION_FEE'`,
      [driver.id]
    );
    assert.equal(ledger.rows[0].count, 1);

    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driver.id]);
    assert.equal(wallet.rows[0].balance_dong, '30000');
    assert.equal(cancelCommands.length, 0);
  });

  it('R03: Ví chỉ 5 000 -> Số dư -15 000 (nợ)', async () => {
    const driverR03 = await createUser('s50-r03@test.invalid', 'DRIVER');
    await query(
      `INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R03', $1, 'ACTIVE')`,
      [driverR03.id]
    );
    await withTransaction((client) => postEntry(client, {
      driverId: driverR03.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 5000,
      receiptCode: `R03-TOPUP-${Date.now()}`,
    }));

    const startsAt = new Date(Date.now() - 3600000).toISOString();
    const expiresAt = new Date(Date.now() - 1800000).toISOString();

    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 103, 'ACCEPTED', $3, $4, 20000)
       RETURNING id`,
      [driverR03.id, connectorId, startsAt, expiresAt]
    );

    await expireReservationsOnce({
      commandSender: { send: async () => ({ status: 'Accepted' }) },
      now: new Date(),
    });

    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverR03.id]);
    assert.equal(wallet.rows[0].balance_dong, '-15000');

    const ledger = await query(
      `SELECT balance_after_dong FROM wallet_ledger WHERE reservation_id = $1`,
      [resInsert.rows[0].id]
    );
    assert.equal(ledger.rows[0].balance_after_dong, '-15000');
  });

  it('R04: StartTransaction mang reservationId trước hạn -> FULFILLED, job không phạt', async () => {
    const driverR04 = await createUser('s50-r04@test.invalid', 'DRIVER');
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R04', $1, 'ACTIVE')`, [driverR04.id]);
    await withTransaction((client) => postEntry(client, {
      driverId: driverR04.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 50000,
      receiptCode: `R04-TOPUP-${Date.now()}`,
    }));

    const startsAt = new Date(Date.now() - 3600000).toISOString();
    const expiresAt = new Date(Date.now() - 1800000).toISOString();

    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 104, 'FULFILLED', $3, $4, 20000)
       RETURNING id`,
      [driverR04.id, connectorId, startsAt, expiresAt]
    );

    await expireReservationsOnce({
      commandSender: { send: async () => assert.fail('should not call cancel on fulfilled') },
      now: new Date(),
    });

    const ledger = await query('SELECT count(*)::int AS count FROM wallet_ledger WHERE reservation_id = $1', [resInsert.rows[0].id]);
    assert.equal(ledger.rows[0].count, 0);

    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverR04.id]);
    assert.equal(wallet.rows[0].balance_dong, '50000');
  });

  it('R05: Cùng tài xế bắt đầu phiên ở đúng đầu nối đó trong thời gian giữ nhưng KHÔNG mang reservationId -> Job đánh FULFILLED, không phạt', async () => {
    const driverR05 = await createUser('s50-r05@test.invalid', 'DRIVER');
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R05', $1, 'ACTIVE')`, [driverR05.id]);
    await withTransaction((client) => postEntry(client, {
      driverId: driverR05.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 50000,
      receiptCode: `R05-TOPUP-${Date.now()}`,
    }));

    const createdAt = new Date(Date.now() - 3600000);
    const sessionStart = new Date(Date.now() - 2400000);
    const expiresAt = new Date(Date.now() - 1800000);

    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, created_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 105, 'ACCEPTED', $3, $4, $5, 20000)
       RETURNING id`,
      [driverR05.id, connectorId, createdAt.toISOString(), expiresAt.toISOString(), createdAt.toISOString()]
    );

    // Tạo phiên sạc của đúng tài xế ở đúng đầu nối trong khoảng [created_at, expires_at]
    await query(
      `INSERT INTO charging_sessions (
         charge_point_id, connector_id, connector_no, id_tag_masked, driver_id,
         meter_start, started_at, status
       ) VALUES ($1, $2, 1, 'TAG-R05', $3, 1000, $4, 'CHARGING')`,
      [chargePointId, connectorId, driverR05.id, sessionStart.toISOString()]
    );

    await expireReservationsOnce({
      commandSender: { send: async () => assert.fail('should not call cancel on fulfilled') },
      now: new Date(),
    });

    const updatedRes = await query('SELECT status FROM reservations WHERE id = $1', [resInsert.rows[0].id]);
    assert.equal(updatedRes.rows[0].status, 'FULFILLED');

    const ledger = await query('SELECT count(*)::int AS count FROM wallet_ledger WHERE reservation_id = $1', [resInsert.rows[0].id]);
    assert.equal(ledger.rows[0].count, 0);

    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverR05.id]);
    assert.equal(wallet.rows[0].balance_dong, '50000');
  });

  it('R06: Phí = 0 -> EXPIRED, KHÔNG có dòng sổ cái, vẫn gửi CancelReservation', async () => {
    const driverR06 = await createUser('s50-r06@test.invalid', 'DRIVER');
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R06', $1, 'ACTIVE')`, [driverR06.id]);
    await withTransaction((client) => postEntry(client, {
      driverId: driverR06.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 50000,
      receiptCode: `R06-TOPUP-${Date.now()}`,
    }));

    const startsAt = new Date(Date.now() - 3600000).toISOString();
    const expiresAt = new Date(Date.now() - 1800000).toISOString();

    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 106, 'ACCEPTED', $3, $4, 0)
       RETURNING id`,
      [driverR06.id, connectorId, startsAt, expiresAt]
    );

    let cancelSent = false;
    const mockCommandSender = {
      send: async (code, action, payload) => {
        if (action === 'CancelReservation' && payload.reservationId === 106) {
          cancelSent = true;
        }
        return { status: 'Accepted' };
      },
    };

    await expireReservationsOnce({
      commandSender: mockCommandSender,
      now: new Date(),
    });

    const updatedRes = await query('SELECT status, cancel_status FROM reservations WHERE id = $1', [resInsert.rows[0].id]);
    assert.equal(updatedRes.rows[0].status, 'EXPIRED');
    assert.equal(updatedRes.rows[0].cancel_status, 'SENT');
    assert.equal(cancelSent, true);

    const ledger = await query('SELECT count(*)::int AS count FROM wallet_ledger WHERE reservation_id = $1', [resInsert.rows[0].id]);
    assert.equal(ledger.rows[0].count, 0);

    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverR06.id]);
    assert.equal(wallet.rows[0].balance_dong, '50000');
  });

  it('R07: Sau khi đặt, trạm đổi phí từ 20 000 sang 50 000 -> Vẫn trừ 20 000 (ảnh chụp)', async () => {
    const driverR07 = await createUser('s50-r07@test.invalid', 'DRIVER');
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R07', $1, 'ACTIVE')`, [driverR07.id]);
    await withTransaction((client) => postEntry(client, {
      driverId: driverR07.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 50000,
      receiptCode: `R07-TOPUP-${Date.now()}`,
    }));

    const startsAt = new Date(Date.now() - 3600000).toISOString();
    const expiresAt = new Date(Date.now() - 1800000).toISOString();

    // Chỗ được tạo khi trạm phí 20 000 (snapshot = 20 000)
    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 107, 'ACCEPTED', $3, $4, 20000)
       RETURNING id`,
      [driverR07.id, connectorId, startsAt, expiresAt]
    );

    // Trạm đổi phí lên 50 000
    await query('UPDATE stations SET no_show_fee_dong = 50000 WHERE id = $1', [stationId]);

    await expireReservationsOnce({
      commandSender: { send: async () => ({ status: 'Accepted' }) },
      now: new Date(),
    });

    const ledger = await query(
      `SELECT amount_dong, balance_after_dong FROM wallet_ledger WHERE reservation_id = $1`,
      [resInsert.rows[0].id]
    );
    assert.equal(ledger.rowCount, 1);
    // Vẫn chỉ trừ 20 000 theo ảnh chụp
    assert.equal(ledger.rows[0].amount_dong, '-20000');
    assert.equal(ledger.rows[0].balance_after_dong, '30000');

    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverR07.id]);
    assert.equal(wallet.rows[0].balance_dong, '30000');
  });
});
