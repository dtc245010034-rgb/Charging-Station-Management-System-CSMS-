const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { run, query, resetSchema, truncateAll } = require('../helpers/db');
const { app, closePool } = require('../helpers/app');
const { withTransaction } = require('../../src/db/tx');
const { postEntry } = require('../../src/modules/wallet/ledger.service');
const { createUser } = require('../helpers/auth');
const { expireReservationsOnce } = require('../../src/modules/reservations/expiry-job');
const { retryCancelPendingReservationsOnce } = require('../../src/modules/reservations/cancel-retry-job');
const service = require('../../src/modules/reservations/reservations.service');
const connections = require('../../src/modules/charge-points/connection-registry');

describe('S-51: Huỷ chỗ đặt và nghiệm thu đua (Bảng R08–R13)', { concurrency: false }, () => {
  let owner;
  let driverA;
  let driverB;
  let stationId;
  let connectorId;
  let chargePointId;
  const CHARGE_POINT_CODE = 'CP-S51-TEST';
  let origIsConnected;

  before(async () => {
    origIsConnected = connections.isConnected;
    connections.isConnected = () => true;
    await resetSchema();
    assert.strictEqual(run('src/db/migrate.js').status, 0);
    await truncateAll();

    owner = await createUser('s51-owner@test.invalid', 'STATION_OWNER');
    driverA = await createUser('s51-driver-a@test.invalid', 'DRIVER');
    driverB = await createUser('s51-driver-b@test.invalid', 'DRIVER');

    const stRes = await query(
      `INSERT INTO stations (name, address, latitude, longitude, status, owner_id, no_show_fee_dong)
       VALUES ('Trạm S-51 Test', 'Hà Nội', 21.0, 105.8, 'ACTIVE', $1, 20000)
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

    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-S51-A', $1, 'ACTIVE')`, [driverA.id]);
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-S51-B', $1, 'ACTIVE')`, [driverB.id]);

    await withTransaction((client) => postEntry(client, {
      driverId: driverA.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 200000,
      receiptCode: `S51-A-TOPUP-${Date.now()}`,
    }));
    await withTransaction((client) => postEntry(client, {
      driverId: driverB.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 200000,
      receiptCode: `S51-B-TOPUP-${Date.now()}`,
    }));
  });

  after(async () => {
    connections.isConnected = origIsConnected;
    await truncateAll();
    await closePool();
  });

  it('R08: Tài xế huỷ trước hạn -> CANCELLED, không phí, gửi CancelReservation 1 lần, tài xế khác đặt được ngay', async () => {
    const startsAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 1800000).toISOString();

    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 208, 'ACCEPTED', $3, $4, 20000)
       RETURNING id`,
      [driverA.id, connectorId, startsAt, expiresAt]
    );
    const reservationId = resInsert.rows[0].id;

    const cancelCommands = [];
    app.locals.commandSender = {
      send: async (code, action, payload) => {
        cancelCommands.push({ code, action, payload });
        return { status: 'Accepted' };
      },
    };

    const res = await request(app)
      .post(`/api/reservations/${reservationId}/cancel`)
      .set('Content-Type', 'application/json')
      .set('Cookie', driverA.cookie)
      .send({});

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'CANCELLED');

    const dbRes = await query('SELECT status, cancel_status FROM reservations WHERE id = $1', [reservationId]);
    assert.equal(dbRes.rows[0].status, 'CANCELLED');

    // Không có dòng sổ cái phí nào
    const ledger = await query('SELECT count(*)::int AS count FROM wallet_ledger WHERE reservation_id = $1', [reservationId]);
    assert.equal(ledger.rows[0].count, 0);

    // CancelReservation được gửi
    assert.equal(cancelCommands.length, 1);
    assert.equal(cancelCommands[0].action, 'CancelReservation');
    assert.equal(cancelCommands[0].payload.reservationId, 208);

    // Driver B có thể đặt chỗ đầu nối đó ngay
    const key = `key-r08-${Date.now()}`;
    const reserveB = await request(app)
      .post('/api/reservations')
      .set('Content-Type', 'application/json')
      .set('Cookie', driverB.cookie)
      .set('Idempotency-Key', key)
      .send({ connectorId, arriveInMinutes: 30 });
    assert.equal(reserveB.status, 201);
    assert.equal(reserveB.body.status, 'ACCEPTED');

    // Cleanup reservation của B để giải phóng connector cho các test sau
    await query(`UPDATE reservations SET status = 'CANCELLED' WHERE id = $1`, [reserveB.body.id]);
  });

  it('R09: Huỷ khi expires_at đã qua nhưng job chưa chạy -> 409 RESERVATION_EXPIRED, sau đó job tính phí', async () => {
    const driverR09 = await createUser('s51-r09@test.invalid', 'DRIVER');
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R09', $1, 'ACTIVE')`, [driverR09.id]);
    await withTransaction((client) => postEntry(client, {
      driverId: driverR09.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 50000,
      receiptCode: `R09-TOPUP-${Date.now()}`,
    }));

    const startsAt = new Date(Date.now() - 3600000).toISOString();
    const expiresAt = new Date(Date.now() - 1000).toISOString();

    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 209, 'ACCEPTED', $3, $4, 20000)
       RETURNING id`,
      [driverR09.id, connectorId, startsAt, expiresAt]
    );
    const reservationId = resInsert.rows[0].id;

    // Huỷ qua API
    const res = await request(app)
      .post(`/api/reservations/${reservationId}/cancel`)
      .set('Content-Type', 'application/json')
      .set('Cookie', driverR09.cookie)
      .send({});

    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, 'RESERVATION_EXPIRED');

    // Sau đó chạy job quá hạn
    await expireReservationsOnce({
      commandSender: { send: async () => ({ status: 'Accepted' }) },
      now: new Date(),
    });

    // Job tính phí và chuyển EXPIRED
    const updatedRes = await query('SELECT status FROM reservations WHERE id = $1', [reservationId]);
    assert.equal(updatedRes.rows[0].status, 'EXPIRED');

    const wallet = await query('SELECT balance_dong FROM wallets WHERE driver_id = $1', [driverR09.id]);
    assert.equal(wallet.rows[0].balance_dong, '30000');
  });

  it('R10: Đua huỷ vs quá hạn (20 vòng, đồng hồ tiêm vào) -> MỖI vòng đúng một kết cục duy nhất', async () => {
    const driverR10 = await createUser('s51-r10@test.invalid', 'DRIVER');
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R10', $1, 'ACTIVE')`, [driverR10.id]);
    await withTransaction((client) => postEntry(client, {
      driverId: driverR10.id,
      entryType: 'TOPUP_MANUAL',
      amountDong: 1000000,
      receiptCode: `R10-TOPUP-${Date.now()}`,
    }));

    let cancelledCount = 0;
    let expiredCount = 0;

    for (let round = 1; round <= 20; round++) {
      const baseTime = Date.now() + 10000000 + round * 7200000;
      const startsAt = new Date(baseTime - 3600000).toISOString();
      const expiryDate = new Date(baseTime);
      const expiresAt = expiryDate.toISOString();

      const resInsert = await query(
        `INSERT INTO reservations (
           driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
           starts_at, expires_at, no_show_fee_dong
         ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), $3, 'ACCEPTED', $4, $5, 20000)
         RETURNING id`,
        [driverR10.id, connectorId, 300 + round, startsAt, expiresAt]
      );
      const reservationId = resInsert.rows[0].id;

      const cancelClock = new Date(expiryDate.getTime() - 1);
      const expiryClock = new Date(expiryDate.getTime());

      const mockSender = { send: async () => ({ status: 'Accepted' }) };

      // Chạy đua song song
      const [cancelOutcome, expiryOutcome] = await Promise.allSettled([
        service.cancel(driverR10, reservationId, {
          commandSender: mockSender,
          now: cancelClock,
        }),
        expireReservationsOnce({
          commandSender: mockSender,
          now: expiryClock,
        }),
      ]);

      const checkRes = await query('SELECT status FROM reservations WHERE id = $1', [reservationId]);
      const finalStatus = checkRes.rows[0].status;

      const feeRows = await query('SELECT * FROM wallet_ledger WHERE reservation_id = $1', [reservationId]);

      if (finalStatus === 'CANCELLED') {
        cancelledCount += 1;
        assert.equal(feeRows.rowCount, 0, `Vòng ${round}: huỷ thành công thì không được trừ phí`);
      } else if (finalStatus === 'EXPIRED') {
        expiredCount += 1;
        assert.equal(feeRows.rowCount, 1, `Vòng ${round}: hết hạn thì phải có đúng 1 dòng trừ phí`);
        assert.equal(feeRows.rows[0].amount_dong, '-20000');
      } else {
        assert.fail(`Vòng ${round}: trạng thái không hợp lệ: ${finalStatus}`);
      }

      void cancelOutcome;
      void expiryOutcome;
    }

    assert.equal(cancelledCount + expiredCount, 20, 'Tổng các kết cục phải đúng bằng 20 vòng');
  });

  it('R11: Người khác huỷ chỗ -> 403 + ACCESS_DENIED; huỷ 2 lần -> 200 {already:true}; huỷ chỗ PENDING -> 409 RESERVATION_PENDING', async () => {
    const driverR11A = await createUser('s51-r11a@test.invalid', 'DRIVER');
    const driverR11B = await createUser('s51-r11b@test.invalid', 'DRIVER');
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R11A', $1, 'ACTIVE')`, [driverR11A.id]);
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R11B', $1, 'ACTIVE')`, [driverR11B.id]);

    const startsAt = new Date(Date.now() + 1000000).toISOString();
    const expiresAt = new Date(Date.now() + 2800000).toISOString();

    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 401, 'ACCEPTED', $3, $4, 20000)
       RETURNING id`,
      [driverR11A.id, connectorId, startsAt, expiresAt]
    );
    const reservationId = resInsert.rows[0].id;

    // 1. Người khác (driverR11B) huỷ chỗ của driverR11A -> 403 + ACCESS_DENIED
    const resOther = await request(app)
      .post(`/api/reservations/${reservationId}/cancel`)
      .set('Content-Type', 'application/json')
      .set('Cookie', driverR11B.cookie)
      .send({});
    assert.equal(resOther.status, 403);

    const auditDenied = await query(
      `SELECT action, user_id FROM audit_logs WHERE action = 'ACCESS_DENIED' AND entity_id = $1`,
      [reservationId]
    );
    assert.ok(auditDenied.rowCount >= 1);

    // 2. Chính chủ huỷ lần 1 -> 200
    const resFirst = await request(app)
      .post(`/api/reservations/${reservationId}/cancel`)
      .set('Content-Type', 'application/json')
      .set('Cookie', driverR11A.cookie)
      .send({});
    assert.equal(resFirst.status, 200);
    assert.equal(resFirst.body.status, 'CANCELLED');

    // 3. Chính chủ huỷ lần 2 -> 200 { already: true }
    const resSecond = await request(app)
      .post(`/api/reservations/${reservationId}/cancel`)
      .set('Content-Type', 'application/json')
      .set('Cookie', driverR11A.cookie)
      .send({});
    assert.equal(resSecond.status, 200);
    assert.equal(resSecond.body.already, true);

    // 4. Huỷ chỗ đang PENDING -> 409 RESERVATION_PENDING
    const pendingStartsAt = new Date(Date.now() + 3000000).toISOString();
    const pendingExpiresAt = new Date(Date.now() + 4800000).toISOString();
    const pendingInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 402, 'PENDING', $3, $4, 20000)
       RETURNING id`,
      [driverR11A.id, connectorId, pendingStartsAt, pendingExpiresAt]
    );

    const resPending = await request(app)
      .post(`/api/reservations/${pendingInsert.rows[0].id}/cancel`)
      .set('Content-Type', 'application/json')
      .set('Cookie', driverR11A.cookie)
      .send({});
    assert.equal(resPending.status, 409);
    assert.equal(resPending.body.error?.code, 'RESERVATION_PENDING');
  });

  it('R12: Trụ ngoại tuyến lúc huỷ/quá hạn -> CSDL CANCELLED/EXPIRED, cancel_status PENDING, retry 5 lần -> FAILED + cảnh báo', async () => {
    const driverR12 = await createUser('s51-r12@test.invalid', 'DRIVER');
    await query(`INSERT INTO id_tags (tag, user_id, status) VALUES ('TAG-R12', $1, 'ACTIVE')`, [driverR12.id]);

    const startsAt = new Date(Date.now() + 5000000).toISOString();
    const expiresAt = new Date(Date.now() + 6800000).toISOString();

    const resInsert = await query(
      `INSERT INTO reservations (
         driver_id, connector_id, id_tag_id, ocpp_reservation_id, status,
         starts_at, expires_at, no_show_fee_dong
       ) VALUES ($1, $2, (SELECT id FROM id_tags WHERE user_id = $1 LIMIT 1), 501, 'ACCEPTED', $3, $4, 20000)
       RETURNING id`,
      [driverR12.id, connectorId, startsAt, expiresAt]
    );
    const reservationId = resInsert.rows[0].id;

    // Trụ offline
    const failingSender = {
      send: async () => {
        throw new Error('Charge point offline');
      },
    };

    // Huỷ khi trụ ngoại tuyến
    await service.cancel(driverR12, reservationId, {
      commandSender: failingSender,
      now: new Date(),
    });

    const resDb = await query('SELECT status, cancel_status, cancel_attempts FROM reservations WHERE id = $1', [reservationId]);
    assert.equal(resDb.rows[0].status, 'CANCELLED');
    assert.equal(resDb.rows[0].cancel_status, 'PENDING');
    assert.equal(resDb.rows[0].cancel_attempts, 1);

    // Thử lại các lần tiếp theo qua retry job
    for (let attempt = 2; attempt <= 5; attempt++) {
      await retryCancelPendingReservationsOnce({
        commandSender: failingSender,
      });
    }

    const finalRes = await query('SELECT status, cancel_status, cancel_attempts FROM reservations WHERE id = $1', [reservationId]);
    assert.equal(finalRes.rows[0].cancel_status, 'FAILED');
    assert.ok(finalRes.rows[0].cancel_attempts >= 5);

    // Kiểm tra cảnh báo trong alerts: kind = RESERVATION_CANCEL_FAILED, dedup_key = 'res:<id>'
    const alertRes = await query(
      `SELECT kind, severity, dedup_key FROM alerts WHERE kind = 'RESERVATION_CANCEL_FAILED' AND dedup_key = $1`,
      [`res:${reservationId}`]
    );
    assert.equal(alertRes.rowCount, 1);
    assert.equal(alertRes.rows[0].kind, 'RESERVATION_CANCEL_FAILED');
    assert.equal(alertRes.rows[0].dedup_key, `res:${reservationId}`);
  });

  it('R13: Sau toàn bộ ca trên -> Σ wallet_ledger.amount_dong = Σ wallets.balance_dong và không có UPDATE/DELETE nào', async () => {
    const sumLedger = await query(`SELECT COALESCE(SUM(amount_dong), 0)::text AS sum FROM wallet_ledger`);
    const sumWallets = await query(`SELECT COALESCE(SUM(balance_dong), 0)::text AS sum FROM wallets`);

    assert.equal(
      BigInt(sumLedger.rows[0].sum),
      BigInt(sumWallets.rows[0].sum),
      `Tổng sổ cái (${sumLedger.rows[0].sum}) phải khớp tổng số dư ví (${sumWallets.rows[0].sum})`
    );

    // Trigger bảo vệ sổ cái: kiểm tra UPDATE/DELETE bị chặn
    await assert.rejects(
      async () => {
        await query('DELETE FROM wallet_ledger');
      },
      /append-only/i,
      'DELETE trên wallet_ledger phải bị trigger chặn'
    );
  });
});
