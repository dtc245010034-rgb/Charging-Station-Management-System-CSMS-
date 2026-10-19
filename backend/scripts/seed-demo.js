// Bộ seed demo DUY NHẤT (GYM-14 / staging / demo chặng 9): tài khoản mỗi vai trò, trạm, trụ, đầu nối,
// biểu giá, phí không đến, khung công suất, ví tài xế, gói thuê bao và tỷ lệ chia sẻ doanh thu.
// Chạy lại nhiều lần an toàn (không tạo trùng, không ghi đè trạng thái đã có).
// KHÔNG chạy trên dữ liệu thật: bắt buộc ALLOW_DEMO_SEED=1 và DEMO_PASSWORD (>= 12 ký tự) từ biến môi trường.
const { z } = require('zod');
const { pool } = require('../src/db/pool');
const { hashPassword } = require('../src/lib/password');
const { postEntry } = require('../src/modules/wallet/ledger.service');
const { ACCOUNTS, DEFAULT_EMAIL_DOMAIN, DEMO_PASSWORD_MIN_LENGTH, emailOf: accountEmail } = require('./lib/demo-accounts');

const input = z.object({
  ALLOW_DEMO_SEED: z.literal('1', { message: 'đặt ALLOW_DEMO_SEED=1 để xác nhận đây là môi trường demo' }),
  DEMO_PASSWORD: z.string().min(DEMO_PASSWORD_MIN_LENGTH, `DEMO_PASSWORD tối thiểu ${DEMO_PASSWORD_MIN_LENGTH} ký tự`),
  DEMO_EMAIL_DOMAIN: z.string().default(DEFAULT_EMAIL_DOMAIN),
  DEMO_STATUSES: z.enum(['0', '1']).default('1'),
}).safeParse(process.env);

if (!input.success) {
  console.error(`Không chạy seed demo: ${input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  process.exit(1);
}
const { DEMO_PASSWORD, DEMO_EMAIL_DOMAIN, DEMO_STATUSES } = input.data;

// Mã trụ vật lý ESP32 và thẻ RFID dùng khi nối thiết bị thật (xem docs/demo/THONG-SO-NOI-TRU-VAT-LY.md).
const ESP32_CHARGE_POINT_CODE = 'ESP32-DEMO-01';
const ESP32_ID_TAG = 'TAG-ESP32-01';

// [owner, tên, địa chỉ, vĩ độ, kinh độ, trạng thái trạm, {powerLimitW, noShowFeeDong, priceDong}]
// priceDong: giá điện đồng/kWh của biểu giá nền (3.850 đ/kWh ở trạm đầu tiên, để so với gói tháng 3.500 đ/kWh).
const STATIONS = [
  ['owner', 'Trạm Cầu Giấy', '144 Xuân Thủy, Cầu Giấy, Hà Nội', 21.0367, 105.7823, 'ACTIVE', { powerLimitW: 30000, noShowFeeDong: 20000, priceDong: 3850 }],
  ['owner', 'Trạm Ba Đình', '12 Kim Mã, Ba Đình, Hà Nội', 21.0318, 105.8146, 'ACTIVE', { powerLimitW: 44000, noShowFeeDong: 25000, priceDong: 4200 }],
  ['owner', 'Trạm Đống Đa', '55 Tây Sơn, Đống Đa, Hà Nội', 21.0087, 105.8228, 'ACTIVE', { powerLimitW: 60000, noShowFeeDong: 20000, priceDong: 3500 }],
  ['owner', 'Trạm Long Biên', '8 Nguyễn Văn Cừ, Long Biên, Hà Nội', 21.0453, 105.8748, 'MAINTENANCE', { priceDong: 3850 }],
  ['owner2', 'Trạm ICTU Thái Nguyên', 'Đại học CNTT&TT, Quyết Thắng, Thái Nguyên', 21.5847, 105.8069, 'ACTIVE', { noShowFeeDong: 10000, priceDong: 3700 }],
  ['owner2', 'Trạm Sông Công', 'Quốc lộ 3, Sông Công, Thái Nguyên', 21.4737, 105.8404, 'INACTIVE', { priceDong: 3700 }],
  // Trạm cho trụ vật lý ESP32 (mục D): 1 trụ, 1 đầu nối đã khai báo; trạng thái UNKNOWN cho tới khi thiết bị BootNotification.
  ['owner', 'Trạm Demo ESP32', 'Phòng thí nghiệm ICTU, Thái Nguyên', 21.585, 105.8072, 'ACTIVE', {
    priceDong: 3850,
    chargePoints: [{ code: ESP32_CHARGE_POINT_CODE, vendor: 'Espressif', model: 'ESP32-DEMO', powerKw: 7.4, connectors: 1 }],
  }],
];

// Gói thuê bao demo theo đáp án chặng 9: 300.000 đ/30 ngày, đồng giá 3.500 đ/kWh cả ngày.
const DEMO_PLAN = { code: 'GOI_THANG_DEMO_3500', name: 'Gói Tháng Tiết Kiệm 3.500', priceDong: 300000, durationDays: 30, pricePerKwhDong: 3500 };
const DEMO_DRIVER_TOPUP_DONG = 1000000;
const TARIFF_EFFECTIVE_FROM = '2026-01-01';
// Khung cao điểm của trạm đầu tiên: 17:00–20:00 hạ còn 15 kW.
const PEAK_WINDOW = { startMinute: 1020, endMinute: 1200, limitW: 15000 };
// Tỷ lệ chia sẻ doanh thu cho chủ trạm (điểm cơ bản: 8500 = 85%).
const PARTNER_SHARE_BP = { owner: 8500, owner2: 9000 };

// Trạng thái gốc OCPP gán xoay vòng để dashboard có đủ nhóm; chỉ gán khi TẠO trụ mới.
const CYCLE = ['Charging', 'Available', 'Available', 'Charging', 'Faulted', 'Available', 'SuspendedEV', 'Unavailable', 'Preparing', 'Available'];

const emailOf = (key) => accountEmail(key, DEMO_EMAIL_DOMAIN);

async function seedUsers(client) {
  const created = [];
  const hash = await hashPassword(DEMO_PASSWORD);
  const ids = {};
  for (const account of ACCOUNTS) {
    const email = emailOf(account.key);
    const found = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (found.rowCount) { ids[account.key] = found.rows[0].id; continue; }
    const user = await client.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [account.name, email, hash]);
    ids[account.key] = user.rows[0].id;
    for (const role of account.roles) {
      await client.query('INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = $2', [user.rows[0].id, role]);
    }
    created.push(email);
  }
  return { ids, created };
}

async function seedStations(client, ownerIds) {
  let stations = 0; let points = 0; let index = 0;
  const stationConfigs = [];
  for (const [position, [owner, name, address, lat, lng, status, config = {}]] of STATIONS.entries()) {
    let station = (await client.query('SELECT id FROM stations WHERE owner_id = $1 AND name = $2', [ownerIds[owner], name])).rows[0];
    if (!station) {
      station = (await client.query(
        'INSERT INTO stations (name, address, latitude, longitude, status, owner_id, power_limit_w, no_show_fee_dong) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
        [name, address, lat, lng, status, ownerIds[owner], config.powerLimitW ?? null, config.noShowFeeDong ?? 0],
      )).rows[0];
      stations += 1;
    }
    stationConfigs.push({ stationId: station.id, ownerKey: owner, ...config });
    const serial = String(position + 1).padStart(2, '0');
    const chargePoints = config.chargePoints ?? [1, 2].map((n) => ({
      code: `DEMO-ST${serial}-CP${n}`, vendor: 'DemoVendor', model: n === 1 ? 'AC-22' : 'DC-60', powerKw: n === 1 ? 22 : 60, connectors: 2, cycleStatus: true,
    }));
    for (const spec of chargePoints) {
      if ((await client.query('SELECT 1 FROM charge_points WHERE code = $1', [spec.code])).rowCount) continue;
      let state = 'UNKNOWN';
      if (spec.cycleStatus && DEMO_STATUSES === '1') { state = CYCLE[index % CYCLE.length]; index += 1; }
      const cp = await client.query(
        'INSERT INTO charge_points (station_id, code, vendor, model, status, power_kw) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [station.id, spec.code, spec.vendor, spec.model, state, spec.powerKw],
      );
      for (let c = 1; c <= spec.connectors; c += 1) {
        await client.query('INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, $2, $3)', [cp.rows[0].id, c, state]);
      }
      points += 1;
    }
  }
  return { stations, points, stationConfigs };
}

// Điền cấu hình còn thiếu cho trạm đã seed từ bản cũ, nhưng không ghi đè giá trị người dùng đã đổi.
async function seedStationSettings(client, { stationId, powerLimitW = null, noShowFeeDong = 0 }) {
  await client.query(
    `UPDATE stations
     SET power_limit_w = COALESCE(power_limit_w, $2),
         no_show_fee_dong = CASE WHEN no_show_fee_dong = 0 THEN $3 ELSE no_show_fee_dong END
     WHERE id = $1`,
    [stationId, powerLimitW, noShowFeeDong],
  );
}

async function seedTariffs(client, stationConfigs, ids) {
  let created = 0;
  for (const { stationId, ownerKey, priceDong } of stationConfigs) {
    if ((await client.query('SELECT 1 FROM tariffs WHERE station_id = $1', [stationId])).rowCount) continue;
    const tariff = await client.query(
      'INSERT INTO tariffs (station_id, version, effective_from, created_by) VALUES ($1, 1, $2, $3) RETURNING id',
      [stationId, TARIFF_EFFECTIVE_FROM, ids[ownerKey]],
    );
    await client.query(
      "INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label) VALUES ($1, 0, 1440, $2, 'Biểu giá tiêu chuẩn')",
      [tariff.rows[0].id, priceDong],
    );
    created += 1;
  }
  return created;
}

async function seedPowerWindow(client, { stationId, ownerKey }, ids) {
  if ((await client.query('SELECT 1 FROM station_power_windows WHERE station_id = $1 AND deleted_at IS NULL', [stationId])).rowCount) return 0;
  await client.query(
    'INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by) VALUES ($1, $2, $3, $4, $5)',
    [stationId, PEAK_WINDOW.startMinute, PEAK_WINDOW.endMinute, PEAK_WINDOW.limitW, ids[ownerKey]],
  );
  return 1;
}

// Nạp ví qua chính dịch vụ sổ cái của ứng dụng; receipt_code cố định nên chạy lại không nạp thêm.
async function seedDriverWallet(client, driverId, adminId) {
  const posted = await postEntry(client, {
    driverId,
    entryType: 'TOPUP_MANUAL',
    amountDong: DEMO_DRIVER_TOPUP_DONG,
    receiptCode: 'SEED-DEMO-TOPUP-DRIVER',
    reason: 'Nạp ví ban đầu cho tài khoản demo',
    createdBy: adminId,
  });
  return !posted.duplicated;
}

async function seedSubscriptionPlan(client, adminId) {
  if ((await client.query('SELECT 1 FROM subscription_plans WHERE code = $1', [DEMO_PLAN.code])).rowCount) return 0;
  const plan = await client.query(
    'INSERT INTO subscription_plans (code, name, price_dong, duration_days, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [DEMO_PLAN.code, DEMO_PLAN.name, DEMO_PLAN.priceDong, DEMO_PLAN.durationDays, adminId],
  );
  await client.query(
    "INSERT INTO subscription_plan_periods (plan_id, start_minute, end_minute, price_per_kwh_dong, label) VALUES ($1, 0, 1440, $2, 'Đồng giá cả ngày')",
    [plan.rows[0].id, DEMO_PLAN.pricePerKwhDong],
  );
  return 1;
}

async function seedPartnerShares(client, ids) {
  let created = 0;
  for (const [ownerKey, shareBp] of Object.entries(PARTNER_SHARE_BP)) {
    const found = await client.query('SELECT 1 FROM partner_share_rates WHERE owner_id = $1 AND effective_from = $2', [ids[ownerKey], TARIFF_EFFECTIVE_FROM]);
    if (found.rowCount) continue;
    await client.query(
      'INSERT INTO partner_share_rates (owner_id, share_bp, effective_from, created_by, note) VALUES ($1, $2, $3, $4, $5)',
      [ids[ownerKey], shareBp, TARIFF_EFFECTIVE_FROM, ids.admin, 'Tỷ lệ demo'],
    );
    created += 1;
  }
  return created;
}

async function seedIdTags(client, ids) {
  const driverId = ids.driver;
  const demoTags = [
    { tag: 'TAG-DEMO-01', user_id: driverId, status: 'ACTIVE', expires_at: null },
    { tag: ESP32_ID_TAG, user_id: driverId, status: 'ACTIVE', expires_at: null },
    { tag: 'TAG-BLOCKED-01', user_id: driverId, status: 'BLOCKED', expires_at: null },
    { tag: 'TAG-EXPIRED-01', user_id: driverId, status: 'ACTIVE', expires_at: '2025-01-01T00:00:00Z' },
  ];
  let tags = 0;
  for (const item of demoTags) {
    if ((await client.query('SELECT 1 FROM id_tags WHERE tag = $1', [item.tag])).rowCount) continue;
    await client.query(
      'INSERT INTO id_tags (tag, user_id, status, expires_at) VALUES ($1, $2, $3, $4)',
      [item.tag, item.user_id, item.status, item.expires_at]
    );
    tags += 1;
  }
  return tags;
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { ids, created } = await seedUsers(client);
    const counts = await seedStations(client, ids);
    const tagCount = await seedIdTags(client, ids);
    for (const config of counts.stationConfigs) await seedStationSettings(client, config);
    const tariffs = await seedTariffs(client, counts.stationConfigs, ids);
    const windows = await seedPowerWindow(client, counts.stationConfigs[0], ids);
    const toppedUp = await seedDriverWallet(client, ids.driver, ids.admin);
    const plans = await seedSubscriptionPlan(client, ids.admin);
    const shares = await seedPartnerShares(client, ids);
    await client.query('COMMIT');
    console.log(`Seed demo xong: ${created.length} tài khoản mới, ${counts.stations} trạm mới, ${counts.points} trụ mới, ${tagCount} thẻ demo mới.`);
    console.log(`Dữ liệu nền mới: ${tariffs} biểu giá, ${windows} khung công suất, ${toppedUp ? 1 : 0} lần nạp ví, ${plans} gói thuê bao, ${shares} tỷ lệ chia sẻ doanh thu.`);
    console.log(`Tài khoản demo (mật khẩu = giá trị DEMO_PASSWORD): ${ACCOUNTS.map((a) => emailOf(a.key)).join(', ')}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
