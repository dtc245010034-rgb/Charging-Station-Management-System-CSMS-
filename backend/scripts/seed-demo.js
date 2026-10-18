// Dữ liệu DEMO cho GYM-14 / staging: tài khoản mỗi vai trò, vài trạm, trụ và đầu nối.
// Chạy lại nhiều lần an toàn (không tạo trùng, không ghi đè trạng thái đã có).
// KHÔNG chạy trên dữ liệu thật: bắt buộc ALLOW_DEMO_SEED=1 và DEMO_PASSWORD (>= 8 ký tự) từ biến môi trường.
const { z } = require('zod');
const { pool } = require('../src/db/pool');
const { hashPassword } = require('../src/lib/password');
const { withTransaction } = require('../src/db/tx');
const { postEntry } = require('../src/modules/wallet/ledger.service');
const { purchaseSubscription } = require('../src/modules/wallet/subscription.service');

const input = z.object({
  ALLOW_DEMO_SEED: z.literal('1', { message: 'đặt ALLOW_DEMO_SEED=1 để xác nhận đây là môi trường demo' }),
  DEMO_PASSWORD: z.string().min(8, 'DEMO_PASSWORD tối thiểu 8 ký tự'),
  DEMO_EMAIL_DOMAIN: z.string().default('demo.csms.local'),
  DEMO_STATUSES: z.enum(['0', '1']).default('1'),
}).safeParse(process.env);

if (!input.success) {
  console.error(`Không chạy seed demo: ${input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  process.exit(1);
}
const { DEMO_PASSWORD, DEMO_EMAIL_DOMAIN, DEMO_STATUSES } = input.data;

const ACCOUNTS = [
  { key: 'owner', name: 'Chủ trạm Demo A', roles: ['STATION_OWNER'] },
  { key: 'owner2', name: 'Chủ trạm Demo B', roles: ['STATION_OWNER'] },
  { key: 'operator', name: 'Vận hành viên Demo', roles: ['OPERATOR'] },
  { key: 'accountant', name: 'Kế toán Demo', roles: ['ACCOUNTANT'] },
  { key: 'driver', name: 'Tài xế Demo', roles: ['DRIVER'] },
  { key: 'multi', name: 'Vận hành kiêm chủ trạm Demo', roles: ['OPERATOR', 'STATION_OWNER'] },
];

// [owner, tên, địa chỉ, vĩ độ, kinh độ, trạng thái trạm]
const STATIONS = [
  ['owner', 'Trạm Cầu Giấy', '144 Xuân Thủy, Cầu Giấy, Hà Nội', 21.0367, 105.7823, 'ACTIVE'],
  ['owner', 'Trạm Ba Đình', '12 Kim Mã, Ba Đình, Hà Nội', 21.0318, 105.8146, 'ACTIVE'],
  ['owner', 'Trạm Đống Đa', '55 Tây Sơn, Đống Đa, Hà Nội', 21.0087, 105.8228, 'ACTIVE'],
  ['owner', 'Trạm Long Biên', '8 Nguyễn Văn Cừ, Long Biên, Hà Nội', 21.0453, 105.8748, 'MAINTENANCE'],
  ['owner2', 'Trạm ICTU Thái Nguyên', 'Đại học CNTT&TT, Quyết Thắng, Thái Nguyên', 21.5847, 105.8069, 'ACTIVE'],
  ['owner2', 'Trạm Sông Công', 'Quốc lộ 3, Sông Công, Thái Nguyên', 21.4737, 105.8404, 'INACTIVE'],
];

// Trạng thái gốc OCPP gán xoay vòng để dashboard có đủ nhóm; chỉ gán khi TẠO trụ mới.
const CYCLE = ['Charging', 'Available', 'Available', 'Charging', 'Faulted', 'Available', 'SuspendedEV', 'Unavailable', 'Preparing', 'Available'];

const emailOf = (key) => `${key}@${DEMO_EMAIL_DOMAIN}`;

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
  for (const [position, [owner, name, address, lat, lng, status]] of STATIONS.entries()) {
    let station = (await client.query('SELECT id FROM stations WHERE owner_id = $1 AND name = $2', [ownerIds[owner], name])).rows[0];
    if (!station) {
      station = (await client.query(
        'INSERT INTO stations (name, address, latitude, longitude, status, owner_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [name, address, lat, lng, status, ownerIds[owner]],
      )).rows[0];
      stations += 1;
    }
    const serial = String(position + 1).padStart(2, '0');
    for (let n = 1; n <= 2; n += 1) {
      const code = `DEMO-ST${serial}-CP${n}`;
      if ((await client.query('SELECT 1 FROM charge_points WHERE code = $1', [code])).rowCount) continue;
      const state = DEMO_STATUSES === '1' ? CYCLE[index % CYCLE.length] : 'UNKNOWN';
      index += 1;
      const cp = await client.query(
        'INSERT INTO charge_points (station_id, code, vendor, model, status, power_kw) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [station.id, code, 'DemoVendor', n === 1 ? 'AC-22' : 'DC-60', state, n === 1 ? 22 : 60],
      );
      for (let c = 1; c <= 2; c += 1) {
        await client.query('INSERT INTO connectors (charge_point_id, connector_no, status) VALUES ($1, $2, $3)', [cp.rows[0].id, c, state]);
      }
      points += 1;
    }
  }
  return { stations, points };
}

async function seedPowerWindows(client, ownerIds) {
  const station = await client.query(
    "SELECT id FROM stations WHERE owner_id = $1 AND name = 'Trạm Cầu Giấy' LIMIT 1",
    [ownerIds.owner]
  );
  if (!station.rows[0]) throw new Error('Không tìm thấy trạm demo Trạm Cầu Giấy');
  const stationId = station.rows[0].id;
  await client.query(
    'UPDATE stations SET power_limit_w = COALESCE(power_limit_w, 44000) WHERE id = $1',
    [stationId]
  );
  const windows = [
    { start: 0, end: 360, limit: 22000 },
    { start: 1020, end: 1260, limit: 22000 },
  ];
  for (const window of windows) {
    const existing = await client.query(
      `SELECT 1 FROM station_power_windows
       WHERE station_id = $1 AND start_minute = $2 AND end_minute = $3 AND deleted_at IS NULL`,
      [stationId, window.start, window.end]
    );
    if (!existing.rowCount) {
      await client.query(
        `INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [stationId, window.start, window.end, window.limit, ownerIds.owner]
      );
    }
  }
}

async function seedIdTags(client, ids) {
  const driverId = ids.driver;
  const demoTags = [
    { tag: 'TAG-DEMO-01', user_id: driverId, status: 'ACTIVE', expires_at: null },
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

async function seedDriverSubscription(driverId) {
  await withTransaction((client) => postEntry(client, {
    driverId,
    entryType: 'TOPUP_MANUAL',
    amountDong: 1000000,
    receiptCode: `DEMO-SEED-DRIVER-WALLET-${driverId}`,
    reason: 'DEMO_SEED',
  }));
  await purchaseSubscription(
    { id: driverId },
    'seed-demo-vip-subscription'
  );
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { ids, created } = await seedUsers(client);
    const counts = await seedStations(client, ids);
    await seedPowerWindows(client, ids);
    const tagCount = await seedIdTags(client, ids);
    await client.query('COMMIT');
    await seedDriverSubscription(ids.driver);
    console.log(`Seed demo xong: ${created.length} tài khoản mới, ${counts.stations} trạm mới, ${counts.points} trụ mới, ${tagCount} thẻ demo mới, gói VIP và lịch hạn mức đã sẵn sàng.`);
    console.log(`Tài khoản demo (mật khẩu = giá trị DEMO_PASSWORD): ${ACCOUNTS.map((a) => emailOf(a.key)).join(', ')}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
