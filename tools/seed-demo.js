#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { createRequire } = require('node:module');

const backendPkg = path.join(__dirname, '..', 'backend', 'package.json');
const requireBackend = createRequire(backendPkg);
const { Client } = requireBackend('pg');
const { hashPassword } = require(path.join(__dirname, '..', 'backend', 'src', 'lib', 'password'));

const passwordEnv = process.env.DEMO_PASSWORD;
if (!passwordEnv || typeof passwordEnv !== 'string' || passwordEnv.trim().length < 12) {
  console.error('LỖI: Biến môi trường DEMO_PASSWORD bắt buộc và phải có ít nhất 12 ký tự.');
  process.exit(1);
}
const demoPassword = passwordEnv.trim();

const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  console.error('LỖI: Thiếu biến môi trường DATABASE_URL hoặc TEST_DATABASE_URL.');
  process.exit(1);
}

async function findOrCreateUser(client, email, name, role, passwordHash) {
  const existing = await client.query('SELECT id, role FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    const user = existing.rows[0];
    await client.query('UPDATE users SET password_hash = $1, name = $2 WHERE id = $3', [passwordHash, name, user.id]);
    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, role]
    );
    return user.id;
  }
  const res = await client.query(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [email, name, passwordHash, role]
  );
  const userId = res.rows[0].id;
  await client.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, role]
  );
  return userId;
}

async function ensureWallet(client, driverId, initialBalanceDong = 500000n) {
  // Tìm hoặc tạo ví
  const wRes = await client.query('SELECT id, balance_dong FROM wallets WHERE driver_id = $1', [driverId]);
  let walletId;
  if (wRes.rowCount === 0) {
    const ins = await client.query(
      `INSERT INTO wallets (driver_id, balance_dong, min_balance_dong, status)
       VALUES ($1, 0, 50000, 'ACTIVE')
       RETURNING id`,
      [driverId]
    );
    walletId = ins.rows[0].id;
  } else {
    walletId = wRes.rows[0].id;
  }

  // Nạp tiền qua sổ cái nếu chưa có giao dịch nạp SEED
  const ledgerCheck = await client.query(
    `SELECT id FROM wallet_ledger WHERE driver_id = $1 AND receipt_code = 'SEED_INITIAL_TOPUP'`,
    [driverId]
  );
  if (ledgerCheck.rowCount === 0 && initialBalanceDong > 0n) {
    const curBalance = BigInt(wRes.rowCount > 0 ? wRes.rows[0].balance_dong : 0);
    const newBalance = curBalance + initialBalanceDong;
    await client.query(
      `INSERT INTO wallet_ledger (wallet_id, driver_id, entry_type, amount_dong, balance_after_dong, receipt_code, reason)
       VALUES ($1, $2, 'TOPUP_MANUAL', $3, $4, 'SEED_INITIAL_TOPUP', 'Nạp tiền ban đầu cho tài khoản demo')`,
      [walletId, driverId, initialBalanceDong.toString(), newBalance.toString()]
    );
    await client.query(
      `UPDATE wallets SET balance_dong = $1 WHERE id = $2`,
      [newBalance.toString(), walletId]
    );
  }
}

async function runSeed() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  console.log('==> Kết nối CSDL thành công. Bắt đầu seed demo data...');

  try {
    const passwordHash = await hashPassword(demoPassword);

    // 1. Dựng 5 tài khoản tương ứng 5 vai trò
    const adminId = await findOrCreateUser(client, 'demo.admin@csms.local', 'Demo Quản trị viên', 'ADMIN', passwordHash);
    const accountantId = await findOrCreateUser(client, 'demo.accountant@csms.local', 'Demo Kế toán viên', 'ACCOUNTANT', passwordHash);
    const operatorId = await findOrCreateUser(client, 'demo.operator@csms.local', 'Demo Vận hành viên', 'OPERATOR', passwordHash);
    const owner1Id = await findOrCreateUser(client, 'demo.owner1@csms.local', 'Demo Chủ trạm 1 (Sài Gòn)', 'STATION_OWNER', passwordHash);
    const owner2Id = await findOrCreateUser(client, 'demo.owner2@csms.local', 'Demo Chủ trạm 2 (Bình Thạnh)', 'STATION_OWNER', passwordHash);
    const driverId = await findOrCreateUser(client, 'demo.driver@csms.local', 'Demo Tài xế EV', 'DRIVER', passwordHash);

    // 2. Dựng ví & thẻ RFID cho tài xế
    await ensureWallet(client, driverId, 1000000n);
    await client.query(
      `INSERT INTO id_tags (tag, user_id, status)
       VALUES ('TAG-DEMO-EV-01', $1, 'ACTIVE')
       ON CONFLICT (tag) DO NOTHING`,
      [driverId]
    );

    // 3. Dựng 3 trạm sạc quanh TP.HCM
    // Trạm 1: Quận 1, TP.HCM (Chủ trạm 1) - có hạn mức công suất 30 kW + khung giờ cao điểm 15 kW
    let st1Res = await client.query(`SELECT id FROM stations WHERE name = 'Trạm Sạc Bến Thành - Q1'`);
    let station1Id;
    if (st1Res.rowCount === 0) {
      const ins = await client.query(
        `INSERT INTO stations (name, address, latitude, longitude, status, owner_id, power_limit_w, no_show_fee_dong, timezone)
         VALUES ('Trạm Sạc Bến Thành - Q1', 'Quận 1, TP. Hồ Chí Minh', 10.7725, 106.6980, 'ACTIVE', $1, 30000, 20000, 'Asia/Ho_Chi_Minh')
         RETURNING id`,
        [owner1Id]
      );
      station1Id = ins.rows[0].id;
    } else {
      station1Id = st1Res.rows[0].id;
    }

    // Trạm 2: Landmark 81, Bình Thạnh (Chủ trạm 2) - có phí không đến 25 000 đ
    let st2Res = await client.query(`SELECT id FROM stations WHERE name = 'Trạm Sạc Landmark 81'`);
    let station2Id;
    if (st2Res.rowCount === 0) {
      const ins = await client.query(
        `INSERT INTO stations (name, address, latitude, longitude, status, owner_id, power_limit_w, no_show_fee_dong, timezone)
         VALUES ('Trạm Sạc Landmark 81', 'Bình Thạnh, TP. Hồ Chí Minh', 10.7950, 106.7218, 'ACTIVE', $1, 44000, 25000, 'Asia/Ho_Chi_Minh')
         RETURNING id`,
        [owner2Id]
      );
      station2Id = ins.rows[0].id;
    } else {
      station2Id = st2Res.rows[0].id;
    }

    // Trạm 3: Thủ Đức (Chủ trạm 1)
    let st3Res = await client.query(`SELECT id FROM stations WHERE name = 'Trạm Sạc Khu Công Nghệ Cao - Thủ Đức'`);
    let station3Id;
    if (st3Res.rowCount === 0) {
      const ins = await client.query(
        `INSERT INTO stations (name, address, latitude, longitude, status, owner_id, power_limit_w, no_show_fee_dong, timezone)
         VALUES ('Trạm Sạc Khu Công Nghệ Cao - Thủ Đức', 'TP. Thủ Đức, TP. Hồ Chí Minh', 10.8540, 106.7860, 'ACTIVE', $1, 60000, 20000, 'Asia/Ho_Chi_Minh')
         RETURNING id`,
        [owner1Id]
      );
      station3Id = ins.rows[0].id;
    } else {
      station3Id = st3Res.rows[0].id;
    }

    // 4. Biểu giá cho Trạm 1 và Trạm 2
    for (const [stId, ownerId, price] of [[station1Id, owner1Id, 3850], [station2Id, owner2Id, 4200], [station3Id, owner1Id, 3500]]) {
      const tCheck = await client.query('SELECT id FROM tariffs WHERE station_id = $1', [stId]);
      if (tCheck.rowCount === 0) {
        const tIns = await client.query(
          `INSERT INTO tariffs (station_id, version, effective_from)
           VALUES ($1, 1, '2026-01-01')
           RETURNING id`,
          [stId]
        );
        const tariffId = tIns.rows[0].id;
        await client.query(
          `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
           VALUES ($1, 0, 1440, $2, 'Biểu giá tiêu chuẩn')`,
          [tariffId, price]
        );
      }
    }

    // 5. Khung giờ công suất cho Trạm 1: Giờ cao điểm 17:00 - 20:00 hạ còn 15 000 W
    const winCheck = await client.query(
      `SELECT id FROM station_power_windows WHERE station_id = $1 AND deleted_at IS NULL`,
      [station1Id]
    );
    if (winCheck.rowCount === 0) {
      await client.query(
        `INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by)
         VALUES ($1, 1020, 1200, 15000, $2)`,
        [station1Id, owner1Id]
      );
    }

    // 6. Trụ sạc và đầu nối cho các trạm
    async function ensureChargePoint(code, stationId) {
      let cpRes = await client.query('SELECT id FROM charge_points WHERE code = $1', [code]);
      let cpId;
      if (cpRes.rowCount === 0) {
        const ins = await client.query(
          `INSERT INTO charge_points (station_id, code, status)
           VALUES ($1, $2, 'ONLINE')
           RETURNING id`,
          [stationId, code]
        );
        cpId = ins.rows[0].id;
      } else {
        cpId = cpRes.rows[0].id;
      }

      for (const no of [1, 2]) {
        await client.query(
          `INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status)
           VALUES ($1, $2, 'AVAILABLE', 'Available')
           ON CONFLICT (charge_point_id, connector_no) DO NOTHING`,
          [cpId, no]
        );
      }
      return cpId;
    }

    const cp1Id = await ensureChargePoint('CP-DEMO-BT-01', station1Id);
    await ensureChargePoint('CP-DEMO-BT-02', station1Id);
    await ensureChargePoint('CP-DEMO-LM-01', station2Id);
    await ensureChargePoint('CP-DEMO-TD-01', station3Id);

    // 7. Gói thuê bao tháng
    const planCode = 'GOI_THANG_DEMO_3500';
    let planRes = await client.query('SELECT id FROM subscription_plans WHERE code = $1', [planCode]);
    let planId;
    if (planRes.rowCount === 0) {
      const ins = await client.query(
        `INSERT INTO subscription_plans (code, name, price_dong, duration_days, created_by)
         VALUES ($1, 'Gói Tháng Tiết Kiệm 3.500', 300000, 30, $2)
         RETURNING id`,
        [planCode, adminId]
      );
      planId = ins.rows[0].id;
      await client.query(
        `INSERT INTO subscription_plan_periods (plan_id, start_minute, end_minute, price_per_kwh_dong, label)
         VALUES ($1, 0, 1440, 3500, 'Đồng giá 3.500 đ/kWh cả ngày')`,
        [planId]
      );
    } else {
      planId = planRes.rows[0].id;
    }

    // 8. Tỉ lệ chia sẻ doanh thu cho chủ trạm (S-54/Chặng 8)
    for (const [stId, ownerId, sharePercent] of [[station1Id, owner1Id, 85], [station2Id, owner2Id, 90], [station3Id, owner1Id, 85]]) {
      const pCheck = await client.query('SELECT id FROM station_partner_shares WHERE station_id = $1', [stId]);
      if (pCheck.rowCount === 0) {
        await client.query(
          `INSERT INTO station_partner_shares (station_id, partner_id, share_percent, created_by)
           VALUES ($1, $2, $3, $4)`,
          [stId, ownerId, sharePercent, adminId]
        );
      }
    }

    // 9. Tạo một vài phiên sạc lịch sử đã thanh toán để có dữ liệu đối soát/báo cáo
    const conn1Res = await client.query('SELECT id FROM connectors WHERE charge_point_id = $1 AND connector_no = 1', [cp1Id]);
    const conn1Id = conn1Res.rows[0].id;

    const histSessionCheck = await client.query(
      `SELECT id FROM charging_sessions WHERE id_tag_masked = 'TAG-DEMO-EV-HIST-01'`
    );
    if (histSessionCheck.rowCount === 0) {
      const sIns = await client.query(
        `INSERT INTO charging_sessions (
           charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
           meter_start, meter_stop, started_at, stopped_at, status, billing_status
         ) VALUES ($1, $2, 1, $3, 'TAG-DEMO-EV-HIST-01',
           0, 20000, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '1 hour',
           'COMPLETED', 'FINAL')
         RETURNING id`,
        [cp1Id, conn1Id, driverId]
      );
      const histSessionId = sIns.rows[0].id;

      // Hóa đơn phiên lịch sử
      const invIns = await client.query(
        `INSERT INTO session_invoices (
           session_id, driver_id, period_date, timezone, total_dong, rounding_rule,
           tariff_source, tariff_snapshot
         ) VALUES ($1, $2, CURRENT_DATE - 3, 'Asia/Ho_Chi_Minh', 77000, 'HALF_UP',
           'STATION', '{"source":"STATION","periods":[{"pricePerKwh":3850,"startMin":0,"endMin":1440}]}')
         RETURNING id`,
        [histSessionId, driverId]
      );
      const invoiceId = invIns.rows[0].id;

      await client.query(
        `INSERT INTO invoice_lines (invoice_id, seq, kind, wh, amount_dong, price_per_kwh_dong)
         VALUES ($1, 1, 'ENERGY', 20000, 77000, 3850)`,
        [invoiceId]
      );

      // Trừ tiền phiên qua sổ cái
      const wDriver = await client.query('SELECT id, balance_dong FROM wallets WHERE driver_id = $1', [driverId]);
      const wId = wDriver.rows[0].id;
      const curBal = BigInt(wDriver.rows[0].balance_dong);
      const nextBal = curBal - 77000n;
      await client.query(
        `INSERT INTO wallet_ledger (wallet_id, driver_id, session_id, entry_type, amount_dong, balance_after_dong, reason)
         VALUES ($1, $2, $3, 'SESSION_DEBIT', '-77000', $4, 'Thanh toán phiên sạc lịch sử demo')`,
        [wId, driverId, histSessionId, nextBal.toString()]
      );
      await client.query('UPDATE wallets SET balance_dong = $1 WHERE id = $2', [nextBal.toString(), wId]);
    }

    console.log('==> Khởi tạo dữ liệu mẫu Demo THÀNH CÔNG (Idempotent).');
    console.log('    Tài khoản demo sẵn sàng:');
    console.log('    - Quản trị: demo.admin@csms.local');
    console.log('    - Kế toán:  demo.accountant@csms.local');
    console.log('    - Vận hành: demo.operator@csms.local');
    console.log('    - Chủ trạm: demo.owner1@csms.local & demo.owner2@csms.local');
    console.log('    - Tài xế:   demo.driver@csms.local (Số dư ví > 900.000 đ)');
    console.log('    (Mật khẩu chung đọc từ biến DEMO_PASSWORD)');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runSeed().catch((err) => {
    console.error('LỖI KHỞI TẠO SEED DEMO:', err);
    process.exit(1);
  });
}

module.exports = { runSeed };
