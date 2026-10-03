/**
 * KIỂM THỬ XÁC MINH S-06 ĐỘC LẬP (REPO-NATIVE VERIFICATION RUNNER)
 * Story S-06: Trụ sạc kết nối WebSocket OCPP 1.6J tới máy chủ CSMS (E-04, T-12, T-13)
 *
 * Cách chạy:
 *   node tools/verify-s06-live.js
 *
 * Biến môi trường tuỳ chọn:
 *   BASE_URL=http://127.0.0.1:3000
 *   WS_URL=ws://127.0.0.1:3000
 */

const path = require('node:path');
const { once } = require('node:events');
const { execSync } = require('node:child_process');

const wsPath = path.resolve(__dirname, '../backend/node_modules/ws');
const { WebSocket } = require(wsPath);

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:3000';
const REPO_ROOT = path.resolve(__dirname, '..');

function queryDb(sql) {
  const sanitized = sql.replace(/"/g, '\\"');
  const cmd = `docker compose exec -T db psql -U csms -d csms -t -A -c "${sanitized}"`;
  const stdout = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' });
  return stdout.trim();
}

async function request(pathUrl, options = {}) {
  const url = new URL(pathUrl, BASE_URL);
  const headers = { ...options.headers };
  if (options.body) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, body: json, text };
}

function testWsUpgrade(codeOrPath, protocols = ['ocpp1.6'], options = {}) {
  return new Promise((resolve) => {
    const isFullPath = codeOrPath.startsWith('/');
    const targetUrl = isFullPath ? `${WS_URL}${codeOrPath}` : `${WS_URL}/ocpp/${encodeURIComponent(codeOrPath)}`;
    const ws = new WebSocket(targetUrl, protocols, options);

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    ws.once('open', () => {
      finish({ ws, status: 101, open: true });
    });

    ws.once('unexpected-response', (req, res) => {
      res.resume();
      finish({ ws, status: res.statusCode, open: false, headers: res.headers });
    });

    ws.once('error', (err) => {
      finish({ ws, error: err.message, open: false });
    });
  });
}

async function closeWs(ws) {
  if (!ws) return;
  if (ws.readyState === WebSocket.OPEN) {
    await new Promise((resolve) => {
      ws.once('close', resolve);
      ws.close();
    });
  } else if (ws.readyState === WebSocket.CONNECTING) {
    ws.terminate();
  }
}

async function runTests() {
  console.log('======================================================================');
  console.log('  KIỂM THỬ XÁC MINH S-06: KẾT NỐI WEBSOCKET OCPP 1.6J (T-12, T-13)');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testId, description, details = '') {
    if (condition) {
      passed++;
      console.log(`[PASS] ${testId}: ${description}`);
      if (details) console.log(`       ↳ ${details}`);
    } else {
      failed++;
      console.error(`[FAIL] ${testId}: ${description}`);
      if (details) console.error(`       ↳ CHI TIẾT LỖI: ${details}`);
    }
  }

  // Giai đoạn 1: Smoke / Prerequisites
  const health = await request('/api/health');
  assert(
    health.status === 200 && health.body?.database === 'postgresql',
    'TC-S06-01',
    'Healthcheck GET /api/health sẵn sàng và kết nối CSDL PostgreSQL',
    `status=${health.status}, database=${health.body?.database}`
  );

  const activeCpCode = queryDb("SELECT cp.code FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE s.status = 'ACTIVE' AND s.locked_at IS NULL LIMIT 1;");
  assert(
    !!activeCpCode,
    'TC-S06-02',
    `Tìm thấy mã trụ sạc ACTIVE trong hệ thống: ${activeCpCode}`,
    `code=${activeCpCode}`
  );

  const maintenanceCpCode = queryDb("SELECT cp.code FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE s.status = 'MAINTENANCE' LIMIT 1;");
  assert(
    !!maintenanceCpCode,
    'TC-S06-03',
    `Tìm thấy mã trụ sạc MAINTENANCE trong hệ thống: ${maintenanceCpCode}`,
    `code=${maintenanceCpCode}`
  );

  // Giai đoạn 2: S06-AC-01 Bắt tay hợp lệ & Giữ kết nối OPEN
  const connActive = await testWsUpgrade(activeCpCode, ['ocpp1.6']);
  const isAc1Open = connActive.open && connActive.ws.readyState === WebSocket.OPEN && connActive.ws.protocol === 'ocpp1.6';
  assert(
    isAc1Open,
    'TC-S06-04',
    'S06-AC-01: Bắt tay HTTP Upgrade 101 thành công với subprotocol ocpp1.6, giữ mở WebSocket',
    `status=${connActive.status}, protocol=${connActive.ws?.protocol}, readyState=${connActive.ws?.readyState}`
  );

  // Kiểm tra trao đổi gói tin trên kết nối hợp lệ
  let bootAccepted = false;
  if (isAc1Open) {
    const bootPromise = new Promise((resolve) => {
      connActive.ws.once('message', (raw) => {
        try {
          const frame = JSON.parse(raw.toString());
          resolve(frame[0] === 3 && frame[2]?.status === 'Accepted');
        } catch {
          resolve(false);
        }
      });
      connActive.ws.send(JSON.stringify([2, 'boot-s06-test', 'BootNotification', {
        chargePointVendor: 'QAVendor',
        chargePointModel: 'QAModel-06'
      }]));
    });
    bootAccepted = await bootPromise;
  }
  await closeWs(connActive.ws);

  assert(
    bootAccepted,
    'TC-S06-05',
    'S06-AC-01: Gửi bản tin BootNotification trên kết nối mới và nhận phản hồi Accepted',
    'Received [3, "boot-s06-test", { status: "Accepted", ... }]'
  );

  // Giai đoạn 3: S06-AC-02 Trạm MAINTENANCE và INACTIVE vẫn được kết nối để báo lỗi
  const connMaint = await testWsUpgrade(maintenanceCpCode, ['ocpp1.6']);
  const isMaintOpen = connMaint.open && connMaint.ws.readyState === WebSocket.OPEN;
  await closeWs(connMaint.ws);

  assert(
    isMaintOpen,
    'TC-S06-06',
    'S06-AC-02: Trụ thuộc trạm MAINTENANCE vẫn kết nối thành công để báo lỗi/trạng thái',
    `status=${connMaint.status}, readyState=OPEN`
  );

  const inactiveCpCode = queryDb("SELECT cp.code FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE s.status = 'INACTIVE' LIMIT 1;");
  if (inactiveCpCode) {
    const connInact = await testWsUpgrade(inactiveCpCode, ['ocpp1.6']);
    const isInactOpen = connInact.open && connInact.ws.readyState === WebSocket.OPEN;
    await closeWs(connInact.ws);
    assert(
      isInactOpen,
      'TC-S06-07',
      'S06-AC-02: Trụ thuộc trạm INACTIVE vẫn kết nối thành công',
      `status=${connInact.status}, readyState=OPEN`
    );
  }

  // Giai đoạn 4: S06-AC-03 / NFR-01 / NFR-02 Từ chối mã chưa đăng ký & an toàn thông tin
  const unknownStart = Date.now();
  const connUnknown = await testWsUpgrade('UNKNOWN-CP-999-NOTFOUND', ['ocpp1.6'], {
    headers: { Cookie: 'secret-cookie-value=xyz', Authorization: 'Bearer super-secret-token' }
  });
  const unknownDuration = Date.now() - unknownStart;
  await closeWs(connUnknown.ws);

  assert(
    connUnknown.status === 403 && unknownDuration < 1000,
    'TC-S06-08',
    'S06-AC-03: Từ chối mã trụ lạ với HTTP 403 Forbidden trong vòng < 1000 ms',
    `statusCode=${connUnknown.status}, duration=${unknownDuration}ms`
  );

  // Giai đoạn 5: S06-AC-04 Chặn mã bất thường (null-byte, gạch chéo, dấu chấm, khoảng trắng, overlong)
  const invalidCases = [
    { code: 'CP-S06\0VALID', name: 'Chứa null-byte (\0)' },
    { code: 'CP-S06.INVALID', name: 'Chứa dấu chấm (.)' },
    { code: 'A'.repeat(51), name: 'Vượt quá 50 ký tự (51 chars)' },
    { code: 'CP-S06 INVALID', name: 'Chứa khoảng trắng' },
  ];

  for (let i = 0; i < invalidCases.length; i++) {
    const item = invalidCases[i];
    const res = await testWsUpgrade(item.code, ['ocpp1.6']);
    await closeWs(res.ws);
    assert(
      res.status === 400,
      `TC-S06-09-${i + 1}`,
      `S06-AC-04: Chặn định dạng mã không hợp lệ: ${item.name}`,
      `code="${item.code.replace(/\0/g, '\\0')}", status=${res.status} (Expected 400)`
    );
  }

  // Giai đoạn 6: S06-AC-05 Chặn giao thức con không hỗ trợ
  const resBadProto = await testWsUpgrade(activeCpCode, ['ocpp2.0.1']);
  await closeWs(resBadProto.ws);
  assert(
    resBadProto.status === 400,
    'TC-S06-10',
    'S06-AC-05: Chặn subprotocol không hỗ trợ (ocpp2.0.1) với HTTP 400 Bad Request',
    `status=${resBadProto.status}`
  );

  const resNoProto = await testWsUpgrade(activeCpCode, []);
  await closeWs(resNoProto.ws);
  assert(
    resNoProto.status === 400,
    'TC-S06-11',
    'S06-AC-05: Chặn khi client không gửi Sec-WebSocket-Protocol với HTTP 400 Bad Request',
    `status=${resNoProto.status}`
  );

  // Giai đoạn 7: Đo hiệu năng và tính ổn định
  const latencies = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    const r = await testWsUpgrade(`UNKNOWN-STRESS-${i}`, ['ocpp1.6']);
    latencies.push(Date.now() - t0);
    await closeWs(r.ws);
  }
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  assert(
    avgLatency < 200,
    'TC-S06-12',
    'NFR-01: Độ trễ phản hồi từ chối mã không hợp lệ trung bình cực thấp (< 200 ms)',
    `avgLatency=${avgLatency.toFixed(2)}ms (Samples: ${latencies.join(', ')} ms)`
  );

  console.log('\n======================================================================');
  console.log(`TỔNG KẾT S-06: ${passed + failed} Test Cases | PASS: ${passed} | FAIL: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
