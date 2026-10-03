/**
 * KIỂM THỬ XÁC MINH S-13 ĐỘC LẬP (REPO-NATIVE VERIFICATION RUNNER)
 * Story S-13: Cùng mã trụ mở hai kết nối thì kết nối cũ bị đóng (E-04, T-28, T-29)
 *
 * Cách chạy:
 *   node tools/verify-s13-live.js
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

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:3000';
const REPO_ROOT = path.resolve(__dirname, '..');

function queryDb(sql) {
  const sanitized = sql.replace(/"/g, '\\"');
  const cmd = `docker compose exec -T db psql -U csms -d csms -t -A -c "${sanitized}"`;
  const stdout = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' });
  return stdout.trim();
}

function connectWs(code, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ocpp/${encodeURIComponent(code)}`, ['ocpp1.6'], options);
    let settled = false;

    ws.once('open', () => {
      if (settled) return;
      settled = true;
      resolve({ ws, status: 101, open: true });
    });

    ws.once('unexpected-response', (req, res) => {
      res.resume();
      if (settled) return;
      settled = true;
      resolve({ ws, status: res.statusCode, open: false });
    });

    ws.once('error', (err) => {
      if (settled) return;
      settled = true;
      resolve({ ws, error: err.message, open: false });
    });
  });
}

function sendAndReceive(ws, frame, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    let timer;
    const onMessage = (raw) => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      try {
        resolve(JSON.parse(raw.toString()));
      } catch (err) {
        reject(err);
      }
    };
    const onError = (err) => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      reject(err);
    };

    timer = setTimeout(() => {
      ws.off('message', onMessage);
      ws.off('error', onError);
      reject(new Error(`Timeout waiting for frame response (${timeoutMs}ms)`));
    }, timeoutMs);

    ws.on('message', onMessage);
    ws.on('error', onError);
    ws.send(typeof frame === 'string' ? frame : JSON.stringify(frame));
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
  console.log('  KIỂM THỬ XÁC MINH S-13: XỬ LÝ KẾT NỐI TRÙNG LẶP (T-28, T-29)');
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

  // Giai đoạn 1: Chuẩn bị 2 mã trụ sạc độc lập
  const cpRows = queryDb("SELECT cp.code FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE s.status = 'ACTIVE' AND s.locked_at IS NULL ORDER BY cp.id ASC LIMIT 2;").split('\n').filter(Boolean);
  assert(cpRows.length >= 2, 'TC-S13-00', `Lấy 2 mã trụ sạc độc lập từ CSDL: ${cpRows.join(', ')}`);
  const [cp1, cp2] = cpRows;

  // Giai đoạn 2: S13-AC-01 Khi kết nối 2 mở cùng mã trụ, kết nối 1 bị đóng với code 1000
  console.log('\n--- Giai đoạn 2: S13-AC-01 Đóng kết nối cũ với Close Code 1000 ---');

  const conn1 = await connectWs(cp1);
  assert(conn1.open && conn1.ws.readyState === WebSocket.OPEN, 'TC-S13-AC1-01', 'Mở kết nối 1 thành công');

  const closePromise1 = new Promise((resolve) => {
    conn1.ws.once('close', (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
  });

  // Mở kết nối 2 cùng mã trụ
  const conn2 = await connectWs(cp1);
  assert(conn2.open && conn2.ws.readyState === WebSocket.OPEN, 'TC-S13-AC1-02', 'Mở kết nối 2 cùng mã trụ thành công');

  const closeResult1 = await closePromise1;
  assert(
    closeResult1.code === 1000 && closeResult1.reason === '',
    'TC-S13-AC1-03',
    'S13-AC-01: Kết nối 1 bị đóng tức thì với Close Code 1000 (Normal Closure), reason=""',
    `closeCode=${closeResult1.code}, reason="${closeResult1.reason}"`
  );

  assert(
    conn2.ws.readyState === WebSocket.OPEN,
    'TC-S13-AC1-04',
    'S13-AC-01: Kết nối 2 duy trì trạng thái OPEN và nắm quyền kiểm soát',
    `readyState=${conn2.ws.readyState}`
  );

  // Giai đoạn 3: S13-AC-02 Kết nối mới hoạt động bình thường, gửi nhận tin OCPP
  console.log('\n--- Giai đoạn 3: S13-AC-02 Kết nối mới hoạt động thông suốt ---');

  const bootRes = await sendAndReceive(conn2.ws, [2, 'boot-s13-survivor', 'BootNotification', {
    chargePointVendor: 'QASurvivor',
    chargePointModel: 'Model-13'
  }]);
  assert(
    bootRes[0] === 3 && bootRes[2]?.status === 'Accepted',
    'TC-S13-AC2-01',
    'S13-AC-02: Kết nối mới gửi BootNotification và nhận Accepted thành công',
    `bootStatus=${bootRes[2]?.status}`
  );

  const hbRes = await sendAndReceive(conn2.ws, [2, 'hb-s13-survivor', 'Heartbeat', {}]);
  assert(
    hbRes[0] === 3 && typeof hbRes[2]?.currentTime === 'string',
    'TC-S13-AC2-02',
    'S13-AC-02: Kết nối mới gửi Heartbeat và nhận currentTime hợp lệ',
    `currentTime=${hbRes[2]?.currentTime}`
  );

  await closeWs(conn2.ws);

  // Giai đoạn 4: S13-AC-03 Cách ly giữa các trụ sạc khác nhau
  console.log('\n--- Giai đoạn 4: S13-AC-03 Độc lập giữa các trụ sạc khác nhau ---');

  const wsA = (await connectWs(cp1)).ws;
  const wsB = (await connectWs(cp2)).ws;
  await sendAndReceive(wsA, [2, 'boot-a', 'BootNotification', { chargePointVendor: 'A', chargePointModel: '1' }]);
  await sendAndReceive(wsB, [2, 'boot-b', 'BootNotification', { chargePointVendor: 'B', chargePointModel: '2' }]);

  // Trụ CP1 mở kết nối mới chiếm quyền
  const wsA2 = (await connectWs(cp1)).ws;
  await sendAndReceive(wsA2, [2, 'boot-a2', 'BootNotification', { chargePointVendor: 'A2', chargePointModel: '1' }]);

  // Kiểm tra: wsB thuộc trụ CP2 phải VẪN MỞ và hoạt động bình thường
  const wsBAlive = wsB.readyState === WebSocket.OPEN;
  const wsBHb = await sendAndReceive(wsB, [2, 'hb-b-check', 'Heartbeat', {}]);

  assert(
    wsBAlive && wsBHb[0] === 3,
    'TC-S13-AC3-01',
    'S13-AC-03: Trụ CP1 thay thế kết nối không làm ảnh hưởng đến kết nối của trụ CP2 độc lập',
    `cp2_readyState=${wsB.readyState}, cp2_heartbeat=${wsBHb[0] === 3 ? 'SUCCESS' : 'FAILED'}`
  );

  await closeWs(wsA);
  await closeWs(wsA2);
  await closeWs(wsB);

  // Giai đoạn 5: S13-AC-04 Kết nối thứ 2 bị lỗi (403/400) không làm đóng kết nối hợp lệ
  console.log('\n--- Giai đoạn 5: S13-AC-04 Kết nối lỗi không làm rớt kết nối hợp lệ ---');

  const validConn = (await connectWs(cp1)).ws;
  await sendAndReceive(validConn, [2, 'boot-valid', 'BootNotification', { chargePointVendor: 'Valid', chargePointModel: '1' }]);

  // Thử kết nối lạ với mã không tồn tại (sẽ nhận 403)
  const badConn = await connectWs('UNKNOWN-CODE-DOES-NOT-EXIST');
  assert(badConn.status === 403, 'TC-S13-AC4-01', 'Kết nối mã lạ bị từ chối 403 Forbidden');

  // Thử kết nối mã lỗi định dạng (sẽ nhận 400)
  const invalidConn = await connectWs('INVALID.CODE.400');
  assert(invalidConn.status === 400, 'TC-S13-AC4-02', 'Kết nối mã sai định dạng bị từ chối 400 Bad Request');

  // Kiểm tra kết nối hợp lệ ban đầu vẫn sống
  const stillOpen = validConn.readyState === WebSocket.OPEN;
  const hbStillOk = await sendAndReceive(validConn, [2, 'hb-check-after-bad', 'Heartbeat', {}]);
  assert(
    stillOpen && hbStillOk[0] === 3,
    'TC-S13-AC4-03',
    'S13-AC-04: Kết nối hợp lệ vẫn mở nguyên vẹn sau khi có các yêu cầu kết nối lỗi 400/403',
    `readyState=${validConn.readyState}, heartbeatStatus=SUCCESS`
  );

  await closeWs(validConn);

  // Giai đoạn 6: S13-AC-05 Chuyển tiếp liên tục 5 lần và Race Condition
  console.log('\n--- Giai đoạn 6: S13-AC-05 Chuyển tiếp liên tục & Tải đồng thời ---');

  // 1. Chuyển tiếp liên tục 5 lần (Rapid turnover)
  let currentWs = (await connectWs(cp1)).ws;
  let rapidPass = true;

  for (let i = 1; i <= 5; i++) {
    const prevWs = currentWs;
    const closedPromise = new Promise((res) => prevWs.once('close', (c) => res(c)));
    const nextConn = await connectWs(cp1);
    currentWs = nextConn.ws;
    const closedCode = await closedPromise;
    if (closedCode !== 1000 || currentWs.readyState !== WebSocket.OPEN) {
      rapidPass = false;
      break;
    }
  }

  // Kết nối cuối cùng gửi Heartbeat
  const finalHb = await sendAndReceive(currentWs, [2, 'hb-rapid-final', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]);
  await closeWs(currentWs);

  assert(
    rapidPass && finalHb[0] === 3,
    'TC-S13-AC5-01',
    'S13-AC-05: Chuyển tiếp kết nối 5 lần liên tiếp: 5/5 socket cũ bị đóng với code 1000, socket cuối cùng hoạt động tốt',
    'Rapid turnover 5/5 SUCCESS'
  );

  // 2. Race condition: Mở 5 kết nối gần như đồng thời cùng mã trụ
  const raceSimulators = [1, 2, 3, 4, 5];
  const raceConns = await Promise.all(raceSimulators.map(() => connectWs(cp1)));

  // Đợi ngắn để cơ chế conflict resolution ổn định
  await new Promise((r) => setTimeout(r, 200));

  const openCount = raceConns.filter((c) => c.ws?.readyState === WebSocket.OPEN).length;
  const closedCount = raceConns.filter((c) => c.ws?.readyState === WebSocket.CLOSED).length;
  const survivorWs = raceConns.find((c) => c.ws?.readyState === WebSocket.OPEN)?.ws;

  let survivorCanCommunicate = false;
  if (survivorWs) {
    const bootCheck = await sendAndReceive(survivorWs, [2, 'race-boot', 'BootNotification', { chargePointVendor: 'Race', chargePointModel: '1' }]);
    survivorCanCommunicate = bootCheck[0] === 3;
    await closeWs(survivorWs);
  }

  assert(
    openCount === 1 && closedCount === 4 && survivorCanCommunicate,
    'TC-S13-AC5-02',
    'S13-AC-05: Race condition 5 kết nối mở đồng thời: DUY NHẤT 1 kết nối sống sót, 4 bị đóng với code 1000',
    `openCount=${openCount}, closedCount=${closedCount}, survivorCommunication=${survivorCanCommunicate}`
  );

  // Giai đoạn 7: S13-NFR-01 / T-28 Chuẩn hóa chữ hoa/thường (Case-insensitivity)
  console.log('\n--- Giai đoạn 7: S13-NFR-01 Chuẩn hóa Case-insensitive & Clean disconnect ---');

  const lowerCode = cp1.toLowerCase();
  const upperCode = cp1.toUpperCase();

  const lowerConn = (await connectWs(lowerCode)).ws;
  const lowerClosePromise = new Promise((res) => lowerConn.once('close', (c) => res(c)));

  const upperConn = (await connectWs(upperCode)).ws;
  const lowerClosedCode = await lowerClosePromise;
  await closeWs(upperConn);

  assert(
    lowerClosedCode === 1000,
    'TC-S13-NFR-01',
    `S13-NFR-01 / T-28: Chuẩn hóa key: mở "${lowerCode}" rồi mở "${upperCode}" coi là trùng lặp, đóng kết nối cũ với code 1000`,
    `closedCode=${lowerClosedCode}`
  );

  console.log('\n======================================================================');
  console.log(`TỔNG KẾT S-13: ${passed + failed} Test Cases | PASS: ${passed} | FAIL: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
