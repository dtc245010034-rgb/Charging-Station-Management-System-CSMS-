#!/usr/bin/env node
// Kiểm tra giao diện/bản đồ (CLAUDE.md mục 4.2) bằng Playwright trên server thật + DB riêng `_chk`.
//
// Cách chạy (Node 22, playwright-core + Chrome hệ thống):
//   UI_TARGETS="before=/duong/dan/worktree-main,after=/duong/dan/repo" \
//   PW_CORE=/duong/dan/node_modules/playwright-core CHROME_PATH=/usr/bin/google-chrome \
//   node tools/verify-ui-round6.js
//
// Mỗi target = một thư mục repo có `backend/` (đã cài node_modules) và `frontend/`.
// Với mỗi target: tạo DB `csms_r6ui_<nhãn>_chk`, migrate, tạo admin bằng mật khẩu ngẫu nhiên (chỉ nằm trong
// bộ nhớ tiến trình, không in ra), seed trạm/trụ/đầu nối bằng SQL, chạy server riêng, mở Chromium headless
// với request tile OSM bị chặn và thay bằng PNG 256x256 trong suốt, kiểm bằng DOM, chụp ảnh, rồi DROP DB.
// Ghi chú: tile OSM thật KHÔNG được kiểm ở đây (sandbox không có Internet).
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');

const backendRequire = (root) => require(require.resolve('pg', { paths: [path.join(root, 'backend')] }));

const OUT = path.resolve(process.env.UI_OUT || path.join(__dirname, '../docs/testing/ui-round6'));
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const BASE_DB = process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';
const TARGETS = (process.env.UI_TARGETS || '').split(',').filter(Boolean).map((item) => {
  const [label, root] = item.split('=');
  return { label, root: path.resolve(root) };
});
if (!TARGETS.length) { console.error('Thiếu UI_TARGETS="nhãn=thư-mục,..."'); process.exit(2); }

// ---------- PNG 256x256 trong suốt ----------
function transparentPng() {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(256 * (1 + 256 * 4));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Dữ liệu seed ----------
// Nhóm kỳ vọng SAU F2: trụ ONLINE mang màu của đầu nối nặng nhất (fault > charging > ready). Trụ ONLINE mà MỌI
// đầu nối đều UNAVAILABLE là "offline"; đầu nối UNKNOWN (chưa báo trạng thái) không hạ cấp trụ ONLINE.
const STATIONS = [
  { key: 'HN', name: 'Trạm Hà Nội', lat: 21.0285, lng: 105.8542, group: 'ready', cps: [{ code: 'R6-HN-01', status: 'ONLINE', cons: [['AVAILABLE', 'Available'], ['AVAILABLE', 'Available']], group: 'ready' }] },
  { key: 'DN', name: 'Trạm Đà Nẵng', lat: 16.0544, lng: 108.2022, group: 'charging', cps: [{ code: 'R6-DN-01', status: 'ONLINE', cons: [['OCCUPIED', 'Charging'], ['AVAILABLE', 'Available']], group: 'charging' }] },
  { key: 'HUE', name: 'Trạm Huế', lat: 16.4637, lng: 107.5909, group: 'fault', cps: [{ code: 'R6-HUE-01', status: 'ONLINE', cons: [['ERROR', 'Faulted'], ['AVAILABLE', 'Available']], group: 'fault' }] },
  { key: 'NT', name: 'Trạm Nha Trang', lat: 12.2388, lng: 109.1967, group: 'offline', cps: [{ code: 'R6-NT-01', status: 'ONLINE', cons: [['UNAVAILABLE', 'Unavailable'], ['UNAVAILABLE', 'Unavailable']], group: 'offline' }] },
  { key: 'SG', name: 'Trạm Sài Gòn', lat: 10.7769, lng: 106.7009, group: 'offline', cps: [{ code: 'R6-SG-01', status: 'UNKNOWN', cons: [['UNKNOWN', 'Charging'], ['UNKNOWN', 'Available']], group: 'offline' }] },
  { key: 'CT', name: 'Trạm Cần Thơ', lat: 10.0452, lng: 105.7469, group: 'fault', cps: [
    { code: 'R6-CT-A', status: 'ONLINE', cons: [['AVAILABLE', 'Available']], group: 'ready' },
    { code: 'R6-CT-B', status: 'ONLINE', cons: [['ERROR', 'Faulted']], group: 'fault' },
    { code: 'R6-CT-C', status: 'UNKNOWN', cons: [['UNKNOWN', null]], group: 'offline' }] },
  { key: 'VT', name: 'Trạm Vũng Tàu', lat: 10.3460, lng: 107.0843, group: 'ready', cps: [{ code: 'R6-VT-01', status: 'ONLINE', cons: [['UNKNOWN', null], ['UNKNOWN', null]], group: 'ready' }] },
  { key: 'NOCOORD', name: 'Trạm Chưa Có Toạ Độ', lat: null, lng: null, group: null, cps: [{ code: 'R6-NC-01', status: 'ONLINE', cons: [['AVAILABLE', 'Available']], group: 'ready' }] },
];
const GROUP_LABEL = { ready: 'Sẵn sàng', charging: 'Đang sạc', fault: 'Lỗi', offline: 'Ngoại tuyến / chưa rõ' };
// Nhãn trụ luôn là tên nhóm trong chú giải (trụ UNKNOWN cũng là "Ngoại tuyến / chưa rõ").
const labelOf = (cp) => GROUP_LABEL[cp.group];
const ALL_CPS = STATIONS.flatMap((s) => s.cps.map((cp) => ({ ...cp, station: s.name })));
const ON_MAP = STATIONS.filter((s) => s.lat !== null);
const countGroups = (items) => items.reduce((acc, item) => { acc[item.group] = (acc[item.group] ?? 0) + 1; return acc; }, {});

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function runNode(root, script, env) {
  const result = spawnSync(process.execPath, [script], { cwd: path.join(root, 'backend'), env, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${script} lỗi (mã ${result.status}): ${(result.stderr || result.stdout).split('\n').slice(0, 3).join(' | ')}`);
}

async function waitHealth(port, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Server thoát sớm');
    const ok = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => { res.resume(); resolve(res.statusCode === 200); });
      req.on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Server không sẵn sàng');
}

async function seed(client) {
  const owner = (await client.query("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.code = 'ADMIN' LIMIT 1")).rows[0].id;
  for (const station of STATIONS) {
    const stationId = (await client.query('INSERT INTO stations (name, address, latitude, longitude, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING id', [station.name, `Địa chỉ ${station.name}`, station.lat, station.lng, owner])).rows[0].id;
    for (const cp of station.cps) {
      const cpId = (await client.query('INSERT INTO charge_points (station_id, code, power_kw, status, vendor, model) VALUES ($1, $2, 22, $3, $4, $5) RETURNING id', [stationId, cp.code, cp.status, 'VendorX', 'ModelY'])).rows[0].id;
      let no = 1;
      for (const [status, ocpp] of cp.cons) {
        await client.query('INSERT INTO connectors (charge_point_id, connector_no, status, ocpp_status) VALUES ($1, $2, $3, $4)', [cpId, no, status, ocpp]);
        no += 1;
      }
    }
  }
}

// ---------- Kiểm tra bằng Playwright ----------
function createRecorder(label) {
  const rows = [];
  return {
    rows,
    check(id, desc, expected, actual, { f2 = false } = {}) {
      const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
      const ok = canon(expected) === canon(actual);
      rows.push({ label, id, desc, expected, actual, ok, f2 });
    },
  };
}

async function runBrowser({ label, base, creds, rec }) {
  const png = transparentPng();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const consoleIssues = [];
  const preLogin = [];
  let loggedIn = false;
  const tileRequests = { blocked: 0 };
  const shots = [];

  async function newPage(viewport) {
    const context = await browser.newContext({ viewport, locale: 'vi-VN' });
    const page = await context.newPage();
    loggedIn = false;
    await page.route('**/*.tile.openstreetmap.org/**', (route) => { tileRequests.blocked += 1; return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png }); });
    page.on('console', (msg) => { if (msg.type() === 'error') (loggedIn ? consoleIssues : preLogin).push(`[${viewport.width}px] console.error: ${msg.text().slice(0, 200)}`); });
    page.on('pageerror', (error) => (loggedIn ? consoleIssues : preLogin).push(`[${viewport.width}px] pageerror: ${String(error.message).slice(0, 200)}`));
    page.on('requestfailed', (req) => (loggedIn ? consoleIssues : preLogin).push(`[${viewport.width}px] requestfailed: ${req.url().slice(0, 120)}`));
    return { context, page };
  }

  async function login(page) {
    await page.goto(`${base}/index.html`);
    await page.fill('#loginEmail', creds.email);
    await page.fill('#loginPassword', creds.password);
    await Promise.all([page.waitForURL(/app\.html/), page.click('#loginSubmitBtn')]);
    await page.waitForSelector('.kpi-row');
    loggedIn = true;
  }

  const shot = async (page, name) => { const file = `${label}-${name}.png`; await page.screenshot({ path: path.join(OUT, file) }); shots.push(file); };
  const go = async (page, hash) => { await page.goto(`${base}/app.html${hash}`); };

  async function markers(page) {
    return page.$$eval('.leaflet-marker-icon', (els) => els.map((el) => ({ name: el.getAttribute('title'), group: [...el.querySelectorAll('.pin')].map((p) => [...p.classList].find((c) => c.startsWith('pin--'))?.slice(5))[0] ?? null })));
  }
  const markerMap = (list) => Object.fromEntries(list.map((m) => [m.name, m.group]));

  async function waitMap(page, expected) {
    await page.waitForFunction((n) => document.querySelectorAll('.leaflet-marker-icon').length === n, expected, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(400);
  }

  // ===== Desktop 1280 =====
  {
    const { context, page } = await newPage({ width: 1280, height: 900 });
    await login(page);

    // Tổng quan: KPI + biểu đồ
    const kpi = await page.$$eval('.kpi-row .kpi', (els) => els.map((el) => ({ label: el.querySelector('.kpi__label').textContent.trim(), value: el.querySelector('.kpi__value').textContent.trim() })));
    const cpGroups = countGroups(ALL_CPS);
    const readKpi = (name) => Number(kpi.find((k) => k.label.includes(name))?.value ?? NaN);
    rec.check('kpi-total', 'KPI Tổng số trụ', ALL_CPS.length, readKpi('Tổng số trụ'));
    rec.check('kpi-ready', 'KPI Sẵn sàng', cpGroups.ready, readKpi('Sẵn sàng'), { f2: true });
    rec.check('kpi-charging', 'KPI Đang sạc', cpGroups.charging, readKpi('Đang sạc'), { f2: true });
    rec.check('kpi-fault', 'KPI Lỗi', cpGroups.fault, readKpi('Lỗi'), { f2: true });
    rec.check('kpi-offline', 'KPI Ngoại tuyến / chưa rõ', cpGroups.offline, readKpi('Ngoại tuyến'), { f2: true });
    await shot(page, 'overview-desktop');

    // Bản đồ
    await go(page, '#/admin/map');
    await page.waitForSelector('.leaflet-container');
    await waitMap(page, ON_MAP.length);
    const found = await markers(page);
    rec.check('map-count', 'Số marker = số trạm có toạ độ', ON_MAP.length, found.length);
    const expectedGroups = Object.fromEntries(ON_MAP.map((s) => [s.name, s.group]));
    const foundMap = markerMap(found);
    for (const station of ON_MAP) {
      rec.check(`marker-${station.key}`, `Màu marker ${station.name}`, station.group, foundMap[station.name] ?? null, { f2: true });
    }
    const noteText = await page.locator('.map-side .field__hint').innerText().catch(() => '');
    rec.check('map-missing-note', 'Ghi chú trạm chưa có toạ độ', '1 trạm chưa có toạ độ nên không hiện trên bản đồ.', noteText.trim());
    const legend = await page.locator('.map-side').innerText();
    for (const g of ['ready', 'charging', 'fault', 'offline']) rec.check(`legend-${g}`, `Chú giải có "${GROUP_LABEL[g]}"`, true, legend.includes(GROUP_LABEL[g]));
    rec.check('legend-warning', 'Chú giải có "Cảnh báo"', true, legend.includes('Cảnh báo'));
    const tilesLoaded = await page.$$eval('.leaflet-tile', (els) => els.length);
    rec.check('tiles-stubbed', 'Leaflet khởi tạo và yêu cầu tile (đã thay bằng PNG trong suốt)', true, tilesLoaded > 0 && tileRequests.blocked > 0);

    // Panel danh sách trạm
    const listItems = await page.$$eval('.map-side .item', (els) => els.map((el) => ({ title: el.querySelector('.item__title')?.textContent, dot: [...el.querySelector('.dot').classList].find((c) => c.startsWith('dot--'))?.slice(5) })));
    rec.check('list-count', 'Panel danh sách: số dòng', ON_MAP.length, listItems.length);
    for (const station of ON_MAP) {
      rec.check(`list-${station.key}`, `Chấm màu danh sách ${station.name}`, station.group, listItems.find((i) => i.title === station.name)?.dot ?? null, { f2: true });
    }
    await shot(page, 'map-desktop');

    // Bộ lọc trạng thái
    for (const group of ['ready', 'charging', 'fault', 'offline']) {
      await page.selectOption('select[aria-label="Lọc theo trạng thái"]', group);
      await page.waitForTimeout(350);
      const expectedNames = ON_MAP.filter((s) => s.group === group).map((s) => s.name).sort();
      const listNames = (await page.$$eval('.map-side .item .item__title', (els) => els.map((el) => el.textContent))).sort();
      const markerNames = (await markers(page)).map((m) => m.name).sort();
      rec.check(`filter-${group}-list`, `Lọc "${GROUP_LABEL[group]}": danh sách`, expectedNames, listNames, { f2: true });
      rec.check(`filter-${group}-markers`, `Lọc "${GROUP_LABEL[group]}": marker`, expectedNames, markerNames, { f2: true });
    }
    await page.selectOption('select[aria-label="Lọc theo trạng thái"]', '');
    await page.waitForTimeout(350);
    await page.fill('input[aria-label="Tìm trạm"]', 'Huế');
    await page.waitForTimeout(350);
    rec.check('search-hue', 'Tìm "Huế": 1 marker', ['Trạm Huế'], (await markers(page)).map((m) => m.name));
    await page.fill('input[aria-label="Tìm trạm"]', '');
    await page.waitForTimeout(350);

    // Popup/chi tiết khi bấm marker và dòng danh sách
    const clickMarker = async (name) => page.evaluate((n) => document.querySelector(`.leaflet-marker-icon[title="${n}"]`).click(), name);
    const drawerInfo = async () => {
      await page.waitForSelector('.drawer .list-row, .drawer .empty', { timeout: 8000 });
      return page.evaluate(() => ({
        title: document.querySelector('.drawer__title')?.textContent.trim(),
        rows: [...document.querySelectorAll('.drawer .list-row')].map((row) => ({
          code: row.querySelector('.row-link')?.textContent.trim(),
          chips: [...row.querySelectorAll('.chips .badge')].map((b) => b.textContent.trim()),
          badge: row.querySelector(':scope > .badge')?.textContent.trim(),
          badgeTitle: row.querySelector(':scope > .badge')?.getAttribute('title'),
        })),
      }));
    };
    const closeDrawer = async () => { await page.keyboard.press('Escape'); await page.waitForSelector('.drawer', { state: 'detached', timeout: 5000 }).catch(() => {}); };

    for (const key of ['DN', 'HUE', 'NT', 'SG', 'CT', 'VT']) {
      const station = STATIONS.find((s) => s.key === key);
      await clickMarker(station.name);
      const info = await drawerInfo();
      rec.check(`drawer-${key}-title`, `Bấm marker ${station.name} mở chi tiết đúng trạm`, station.name, info.title);
      for (const cp of station.cps) {
        const row = info.rows.find((r) => r.code === cp.code);
        rec.check(`drawer-${key}-${cp.code}`, `Chi tiết ${cp.code}: nhãn trụ`, labelOf(cp), row?.badge ?? null, { f2: cp.status === 'ONLINE' });
        rec.check(`drawer-${key}-${cp.code}-tooltip`, `Chi tiết ${cp.code}: tooltip giữ trạng thái gốc`, `Trạng thái gốc: ${cp.status}`, row?.badgeTitle ?? null);
        rec.check(`drawer-${key}-${cp.code}-chips`, `Chi tiết ${cp.code}: đầu nối`, cp.cons.map(([status], i) => `Đầu ${i + 1}: ${status}`), row?.chips ?? null);
      }
      if (key === 'NT') await shot(page, 'station-drawer-unavailable-desktop');
      if (key === 'DN') await shot(page, 'station-drawer-charging-desktop');
      await closeDrawer();
    }
    // bấm dòng danh sách
    await page.locator('.map-side .item', { hasText: 'Trạm Hà Nội' }).click();
    const hn = await drawerInfo();
    rec.check('drawer-list-click', 'Bấm dòng danh sách mở chi tiết Trạm Hà Nội', 'Trạm Hà Nội', hn.title);
    await closeDrawer();

    // Màn danh sách trụ
    await go(page, '#/admin/charge-points');
    await page.waitForSelector('table tbody tr');
    await page.waitForTimeout(500);
    const tableRows = await page.$$eval('table tbody tr', (trs) => trs.map((tr) => ({ code: tr.querySelector('.mono')?.textContent.trim(), badge: tr.querySelector('.badge')?.textContent.trim(), title: tr.querySelector('.badge')?.getAttribute('title'), cls: [...tr.querySelector('.badge').classList].find((c) => c.startsWith('badge--')) })));
    rec.check('cp-rows', 'Danh sách trụ: số dòng', ALL_CPS.length, tableRows.length);
    for (const cp of ALL_CPS) {
      const row = tableRows.find((r) => r.code === cp.code);
      rec.check(`cp-${cp.code}`, `Danh sách trụ ${cp.code}: nhãn`, labelOf(cp), row?.badge ?? null, { f2: cp.status === 'ONLINE' });
      rec.check(`cp-${cp.code}-class`, `Danh sách trụ ${cp.code}: màu badge`, `badge--${cp.group}`, row?.cls ?? null, { f2: cp.status === 'ONLINE' });
      rec.check(`cp-${cp.code}-tooltip`, `Danh sách trụ ${cp.code}: tooltip trạng thái gốc`, `Trạng thái gốc: ${cp.status}`, row?.title ?? null);
    }
    await shot(page, 'charge-points-desktop');
    for (const group of ['ready', 'charging', 'fault', 'offline']) {
      await page.selectOption('select[aria-label="Lọc theo trạng thái"]', group);
      await page.waitForTimeout(300);
      const expectedCodes = ALL_CPS.filter((cp) => cp.group === group).map((cp) => cp.code).sort();
      const codes = (await page.$$eval('table tbody tr .mono', (els) => els.map((el) => el.textContent.trim()))).sort();
      rec.check(`cp-filter-${group}`, `Lọc trụ "${GROUP_LABEL[group]}"`, expectedCodes, codes, { f2: true });
    }
    await page.selectOption('select[aria-label="Lọc theo trạng thái"]', '');
    await page.waitForTimeout(300);

    // Ngăn chi tiết trụ
    for (const code of ['R6-DN-01', 'R6-NT-01', 'R6-SG-01', 'R6-VT-01']) {
      const cp = ALL_CPS.find((c) => c.code === code);
      await page.locator('table tbody tr', { hasText: code }).click();
      await page.waitForSelector('.drawer .kv');
      await page.waitForTimeout(300);
      const detail = await page.evaluate(() => ({
        raw: [...document.querySelectorAll('.drawer .kv dd .mono')].map((el) => el.textContent.trim()),
        head: document.querySelector('.drawer__head .badge')?.textContent.trim(),
        connectors: [...document.querySelectorAll('.drawer .list-rows .list-row')].map((row) => ({ no: row.querySelector('.cell-strong')?.textContent.trim(), badge: row.querySelector('.badge')?.textContent.trim(), title: row.querySelector('.badge')?.getAttribute('title') })),
      }));
      rec.check(`cpd-${code}-head`, `Ngăn chi tiết ${code}: nhãn trụ`, labelOf(cp), detail.head ?? null, { f2: cp.status === 'ONLINE' });
      rec.check(`cpd-${code}-raw`, `Ngăn chi tiết ${code}: "Trạng thái gốc"`, cp.status, detail.raw[0] ?? null);
      rec.check(`cpd-${code}-connectors`, `Ngăn chi tiết ${code}: tooltip đầu nối giữ OCPP gốc`, cp.cons.map(([, ocpp]) => `Trạng thái gốc: ${ocpp ?? 'UNKNOWN'}`), detail.connectors.map((c) => c.title));
      if (code === 'R6-NT-01') await shot(page, 'charge-point-drawer-unavailable-desktop');
      if (code === 'R6-DN-01') await shot(page, 'charge-point-drawer-charging-desktop');
      await closeDrawer();
    }
    await context.close();
  }

  // ===== Mobile 390 =====
  {
    const { context, page } = await newPage({ width: 390, height: 844 });
    await login(page);
    await shot(page, 'overview-mobile');
    await go(page, '#/admin/map');
    await page.waitForSelector('.leaflet-container');
    await waitMap(page, ON_MAP.length);
    const found = await markers(page);
    rec.check('m-map-count', '[390px] Số marker = số trạm có toạ độ', ON_MAP.length, found.length);
    const foundMap = markerMap(found);
    rec.check('m-marker-colors', '[390px] Màu marker theo nhóm', Object.fromEntries(ON_MAP.map((s) => [s.name, s.group])), foundMap, { f2: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    rec.check('m-no-hscroll', '[390px] Không tràn ngang trang bản đồ', true, overflow <= 1);
    await shot(page, 'map-mobile');
    await page.locator('.map-side .item', { hasText: 'Trạm Đà Nẵng' }).scrollIntoViewIfNeeded();
    await page.locator('.map-side .item', { hasText: 'Trạm Đà Nẵng' }).click();
    await page.waitForSelector('.drawer .list-row');
    await shot(page, 'station-drawer-mobile');
    await page.keyboard.press('Escape');
    await go(page, '#/admin/charge-points');
    await page.waitForSelector('table tbody tr');
    await page.waitForTimeout(500);
    const mobileBadges = await page.$$eval('table tbody tr', (trs) => Object.fromEntries(trs.map((tr) => [tr.querySelector('.mono')?.textContent.trim(), tr.querySelector('.badge')?.textContent.trim()])));
    rec.check('m-cp-badges', '[390px] Nhãn trạng thái trụ', Object.fromEntries(ALL_CPS.map((cp) => [cp.code, labelOf(cp)])), mobileBadges, { f2: true });
    const overflowCp = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    rec.check('m-no-hscroll-cp', '[390px] Không tràn ngang trang danh sách trụ', true, overflowCp <= 1);
    await shot(page, 'charge-points-mobile');
    await context.close();
  }

  await browser.close();
  rec.check('console-clean', 'Không lỗi JS/console/request ngoài tile đã chặn', [], consoleIssues);
  return { shots, consoleIssues, preLogin, tileRequests: tileRequests.blocked };
}

// ---------- Điều phối ----------
async function runTarget(target) {
  const { Client } = backendRequire(target.root);
  const dbName = `csms_r6ui_${target.label}_chk`;
  if (!dbName.endsWith('_chk')) throw new Error('Tên DB phải kết thúc _chk');
  const adminUrl = new URL(BASE_DB); adminUrl.pathname = '/postgres';
  const dbUrl = new URL(BASE_DB); dbUrl.pathname = `/${dbName}`;
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${dbName}`);

  const port = await freePort();
  const creds = { email: `ui-r6-${crypto.randomBytes(4).toString('hex')}@test.invalid`, password: crypto.randomBytes(18).toString('base64url') };
  const env = {
    PATH: process.env.PATH, CSMS_SKIP_DOTENV: '1', NODE_ENV: 'development', PORT: String(port),
    DATABASE_URL: dbUrl.toString(), JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    APP_ORIGIN: `http://127.0.0.1:${port}`, ADMIN_EMAIL: creds.email, ADMIN_PASSWORD: creds.password,
  };
  const rec = createRecorder(target.label);
  let server;
  let result;
  try {
    runNode(target.root, 'src/db/migrate.js', env);
    runNode(target.root, 'scripts/create-admin.js', env);
    server = spawn(process.execPath, ['src/server.js'], { cwd: path.join(target.root, 'backend'), env, stdio: 'ignore' });
    await waitHealth(port, server);
    // Seed SAU khi server chạy: bản có N4 sẽ đưa mọi trụ ONLINE mồ côi về UNKNOWN lúc khởi động.
    const db = new Client({ connectionString: dbUrl.toString() });
    await db.connect();
    try { await seed(db); } finally { await db.end(); }
    result = await runBrowser({ label: target.label, base: `http://127.0.0.1:${port}`, creds, rec });
  } finally {
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise((resolve) => { server.once('exit', resolve); setTimeout(resolve, 5000); }); }
    await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await admin.end();
  }
  return { rows: rec.rows, ...result };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = {};
  for (const target of TARGETS) {
    process.stdout.write(`== ${target.label}: ${target.root}\n`);
    report[target.label] = await runTarget(target);
    const rows = report[target.label].rows;
    const fail = rows.filter((r) => !r.ok);
    const f2Fail = fail.filter((r) => r.f2);
    console.log(`   tổng ${rows.length} kiểm tra, ok ${rows.length - fail.length}, FAIL ${fail.length} (trong đó liên quan F2: ${f2Fail.length}); tile bị chặn/thay thế: ${report[target.label].tileRequests}`);
    for (const row of fail) console.log(`   FAIL${row.f2 ? ' [F2]' : ''} ${row.id}: ${row.desc} | kỳ vọng ${JSON.stringify(row.expected)} | thực tế ${JSON.stringify(row.actual)}`);
    if (report[target.label].preLogin.length) console.log(`   (trước đăng nhập, bỏ qua: ${report[target.label].preLogin.length} dòng, vd ${report[target.label].preLogin[0]})`);
    if (report[target.label].consoleIssues.length) console.log(`   console: ${report[target.label].consoleIssues.slice(0, 5).join(' || ')}`);
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(report, null, 2));
  const afterFail = (report.after?.rows ?? []).filter((r) => !r.ok).length;
  const beforeNonF2Fail = (report.before?.rows ?? []).filter((r) => !r.ok && !r.f2).length;
  process.exitCode = afterFail === 0 && beforeNonF2Fail === 0 ? 0 : 1;
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
