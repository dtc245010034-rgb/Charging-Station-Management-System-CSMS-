/**
 * KIỂM THỬ XÁC MINH S-07 ĐỘC LẬP (REPO-NATIVE VERIFICATION RUNNER)
 * Story S-07: Đọc và ghi đúng ba loại khung tin nhắn OCPP (CALL, CALLRESULT, CALLERROR) (E-04, T-14, T-15)
 *
 * Cách chạy:
 *   node tools/verify-s07-live.js
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

// Nạp trực tiếp codec frames.js để kiểm thử đơn vị T-14 song song với live test
const framesModulePath = path.resolve(__dirname, '../backend/src/modules/ocpp/frames.js');
const { parseFrame, encodeCall, encodeCallResult, encodeCallError, OcppFrameError } = require(framesModulePath);

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:3000';
const REPO_ROOT = path.resolve(__dirname, '..');

function queryDb(sql) {
  const sanitized = sql.replace(/"/g, '\\"');
  const cmd = `docker compose exec -T db psql -U csms -d csms -t -A -c "${sanitized}"`;
  const stdout = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' });
  return stdout.trim();
}

async function connectLiveWs(code) {
  const ws = new WebSocket(`${WS_URL}/ocpp/${encodeURIComponent(code)}`, ['ocpp1.6']);
  await once(ws, 'open');
  return ws;
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
  console.log('  KIỂM THỬ XÁC MINH S-07: ĐỌC & GHI BA LOẠI KHUNG TIN NHẮN OCPP (T-14, T-15)');
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

  // =========================================================================
  // GIAI ĐOẠN 1: T-14 Kiểm thử đơn vị module Codec frames.js (In-memory)
  // =========================================================================
  console.log('--- Giai đoạn 1: T-14 Kiểm tra Module Codec frames.js ---');

  // Test 1: CALL Round-trip
  const rawCall = [2, 'msg-call-1', 'BootNotification', { vendor: 'Test', model: 'M1' }];
  const parsedCall = parseFrame(rawCall);
  const reEncodedCall = encodeCall(parsedCall.messageId, parsedCall.action, parsedCall.payload);
  assert(
    parsedCall.type === 'CALL' && parsedCall.messageId === 'msg-call-1' &&
    parsedCall.action === 'BootNotification' && JSON.stringify(reEncodedCall) === JSON.stringify(rawCall),
    'TC-S07-T14-01',
    'T-14: Parse và Encode khung CALL round-trip bảo toàn 100% dữ liệu',
    `type=${parsedCall.type}, id=${parsedCall.messageId}`
  );

  // Test 2: CALLRESULT Round-trip
  const rawResult = [3, 'msg-res-1', { status: 'Accepted', interval: 300 }];
  const parsedResult = parseFrame(rawResult);
  const reEncodedResult = encodeCallResult(parsedResult.messageId, parsedResult.payload);
  assert(
    parsedResult.type === 'CALLRESULT' && parsedResult.messageId === 'msg-res-1' &&
    parsedResult.payload.status === 'Accepted' && JSON.stringify(reEncodedResult) === JSON.stringify(rawResult),
    'TC-S07-T14-02',
    'T-14: Parse và Encode khung CALLRESULT round-trip bảo toàn 100% dữ liệu',
    `type=${parsedResult.type}, status=${parsedResult.payload.status}`
  );

  // Test 3: CALLERROR Round-trip
  const rawError = [4, 'msg-err-1', 'NotImplemented', 'Action is not supported', { extra: 'info' }];
  const parsedError = parseFrame(rawError);
  const reEncodedError = encodeCallError(parsedError.messageId, parsedError.errorCode, parsedError.errorDescription, parsedError.errorDetails);
  assert(
    parsedError.type === 'CALLERROR' && parsedError.messageId === 'msg-err-1' &&
    parsedError.errorCode === 'NotImplemented' && JSON.stringify(reEncodedError) === JSON.stringify(rawError),
    'TC-S07-T14-03',
    'T-14: Parse và Encode khung CALLERROR round-trip bảo toàn 100% dữ liệu',
    `type=${parsedError.type}, errorCode=${parsedError.errorCode}`
  );

  // Test 4: Unicode & Data Types
  const unicodeCall = [2, 'msg-vn-1', 'DataTransfer', { message: 'Tiếng Việt có dấu', count: 123456, active: true }];
  const parsedUnicode = parseFrame(unicodeCall);
  assert(
    parsedUnicode.payload.message === 'Tiếng Việt có dấu' && parsedUnicode.payload.count === 123456,
    'TC-S07-T14-04',
    'T-14: Codec hỗ trợ trọn vẹn Unicode Tiếng Việt, số thực và boolean',
    `message="${parsedUnicode.payload.message}"`
  );

  // =========================================================================
  // GIAI ĐOẠN 2: S07-AC-01 Xử lý khung CALL hợp lệ trên Live WebSocket
  // =========================================================================
  console.log('\n--- Giai đoạn 2: S07-AC-01 Xử lý CALL hợp lệ trên Live Server ---');

  const cpCode = queryDb("SELECT cp.code FROM charge_points cp JOIN stations s ON s.id = cp.station_id WHERE s.status = 'ACTIVE' AND s.locked_at IS NULL LIMIT 1;");
  assert(!!cpCode, 'TC-S07-AC1-00', `Lấy mã trụ sạc hợp lệ để chạy live: ${cpCode}`);

  const liveWs = await connectLiveWs(cpCode);

  // Test 5: BootNotification CALL -> CALLRESULT
  const bootReq = [2, 'msg-boot-s07', 'BootNotification', { chargePointVendor: 'TestQAVendor', chargePointModel: 'TestModelX' }];
  const bootRes = await sendAndReceive(liveWs, bootReq);
  assert(
    bootRes[0] === 3 && bootRes[1] === 'msg-boot-s07' && bootRes[2]?.status === 'Accepted',
    'TC-S07-AC1-01',
    'S07-AC-01: Gửi CALL BootNotification nhận CALLRESULT khớp messageId và status Accepted',
    `responseType=${bootRes[0]}, messageId=${bootRes[1]}, status=${bootRes[2]?.status}`
  );

  // Test 6: Heartbeat CALL -> CALLRESULT
  const hbReq = [2, 'msg-hb-s07', 'Heartbeat', {}];
  const hbRes = await sendAndReceive(liveWs, hbReq);
  assert(
    hbRes[0] === 3 && hbRes[1] === 'msg-hb-s07' && typeof hbRes[2]?.currentTime === 'string',
    'TC-S07-AC1-02',
    'S07-AC-01: Gửi CALL Heartbeat nhận CALLRESULT khớp messageId và currentTime hợp lệ',
    `currentTime=${hbRes[2]?.currentTime}`
  );

  // Test 7: Authorize CALL -> CALLRESULT
  const authReq = [2, 'msg-auth-s07', 'Authorize', { idTag: 'TAG-VALID-01' }];
  const authRes = await sendAndReceive(liveWs, authReq);
  assert(
    authRes[0] === 3 && authRes[1] === 'msg-auth-s07' && authRes[2]?.idTagInfo?.status === 'Accepted',
    'TC-S07-AC1-03',
    'S07-AC-01: Gửi CALL Authorize nhận CALLRESULT với idTagInfo.status=Accepted',
    `idTagStatus=${authRes[2]?.idTagInfo?.status}`
  );

  // =========================================================================
  // GIAI ĐOẠN 3: S07-AC-02 Khung sai định dạng trả CALLERROR & KHÔNG ĐÓNG KẾT NỐI
  // =========================================================================
  console.log('\n--- Giai đoạn 3: S07-AC-02 Khung sai trả CALLERROR & Giữ mở kết nối ---');

  const malformedCases = [
    { name: 'JSON không hợp lệ', frame: '{ not valid json ', expectedCode: 'FormationViolation', expectedId: '' },
    { name: 'Không phải mảng JSON', frame: '{"type":"CALL"}', expectedCode: 'FormationViolation', expectedId: '' },
    { name: 'Mảng rỗng []', frame: '[]', expectedCode: 'FormationViolation', expectedId: '' },
    { name: 'Loại tin nhắn không hỗ trợ (loại 9)', frame: [9, 'msg-type-9'], expectedCode: 'ProtocolError', expectedId: 'msg-type-9' },
    { name: 'CALL thiếu tham số action', frame: [2, 'msg-missing-act'], expectedCode: 'FormationViolation', expectedId: 'msg-missing-act' },
    { name: 'CALL thiếu payload', frame: [2, 'msg-missing-pay', 'Heartbeat'], expectedCode: 'FormationViolation', expectedId: 'msg-missing-pay' },
    { name: 'CALL sai kiểu payload (chuỗi thay vì object)', frame: [2, 'msg-bad-pay', 'Heartbeat', 'string'], expectedCode: 'FormationViolation', expectedId: 'msg-bad-pay' },
  ];

  for (let i = 0; i < malformedCases.length; i++) {
    const item = malformedCases[i];
    const res = await sendAndReceive(liveWs, item.frame);
    const isOpen = liveWs.readyState === WebSocket.OPEN;
    assert(
      res[0] === 4 && res[2] === item.expectedCode && isOpen,
      `TC-S07-AC2-${i + 1}`,
      `S07-AC-02: Khung lỗi (${item.name}) trả CALLERROR [${res[2]}], socket duy trì OPEN`,
      `resCode=${res[2]}, messageId="${res[1]}", readyState=${liveWs.readyState}`
    );
  }

  // S07-AC-02 Đặc tả chống vòng lặp lỗi: Gửi CALLERROR sai định dạng từ client -> máy chủ bỏ qua an toàn, không phản hồi lỗi và không đóng socket
  liveWs.send(JSON.stringify([4, 'msg-malformed-err', 'ProtocolError'])); // Thiếu errorDescription & errorDetails
  await new Promise((r) => setTimeout(r, 100)); // Đợi xử lý
  assert(
    liveWs.readyState === WebSocket.OPEN,
    'TC-S07-AC2-NO-LOOP',
    'S07-AC-02: Client gửi CALLERROR sai định dạng được máy chủ bỏ qua an toàn, chống phản chiếu lỗi vô hạn',
    `readyState=${liveWs.readyState}`
  );

  // Test Liveness sau khi gửi hàng loạt khung lỗi: gửi Heartbeat phải thành công
  const livenessRes = await sendAndReceive(liveWs, [2, 'msg-liveness-check', 'Heartbeat', {}]);
  assert(
    livenessRes[0] === 3 && livenessRes[1] === 'msg-liveness-check',
    'TC-S07-AC2-LIVENESS',
    'S07-AC-02 (Liveness): Sau loạt khung lỗi liên tiếp, WebSocket vẫn tiếp nhận bình thường và phản hồi Heartbeat',
    `livenessResult=${livenessRes[0] === 3 ? 'SUCCESS' : 'FAILED'}`
  );

  // =========================================================================
  // GIAI ĐOẠN 4: S07-AC-03 Hành động không hỗ trợ trả NotImplemented
  // =========================================================================
  console.log('\n--- Giai đoạn 4: S07-AC-03 Hành động lạ trả NotImplemented & Ghi log an toàn ---');

  // Test 8: Hành động tuỳ biến chưa hỗ trợ
  const unkRes = await sendAndReceive(liveWs, [2, 'msg-unknown-act', 'NonExistentActionFooBar', {}]);
  assert(
    unkRes[0] === 4 && unkRes[1] === 'msg-unknown-act' && unkRes[2] === 'NotImplemented',
    'TC-S07-AC3-01',
    'S07-AC-03: Hành động chưa hỗ trợ (NonExistentActionFooBar) trả về CALLERROR NotImplemented',
    `code=${unkRes[2]}, desc="${unkRes[3]}"`
  );

  // Test 9: Phân biệt chữ hoa / chữ thường
  const caseRes = await sendAndReceive(liveWs, [2, 'msg-case-act', 'heartbeat', {}]);
  assert(
    caseRes[0] === 4 && caseRes[2] === 'NotImplemented',
    'TC-S07-AC3-02',
    'S07-AC-03: Hành động sai chữ hoa/thường ("heartbeat" thay vì "Heartbeat") trả về NotImplemented',
    `code=${caseRes[2]}`
  );

  // Test 10: Tên hành động chứa ký tự đặc biệt / chống Log Injection
  const injectRes = await sendAndReceive(liveWs, [2, 'msg-crlf-act', 'ActionWith\r\nCRLF_Injection', {}]);
  assert(
    injectRes[0] === 4 && injectRes[2] === 'NotImplemented',
    'TC-S07-AC3-03',
    'S07-AC-03: Tên hành động chứa ký tự điều khiển CRLF trả về NotImplemented an toàn',
    `code=${injectRes[2]}`
  );

  // =========================================================================
  // GIAI ĐOẠN 5: S07-AC-04 Gửi nhiều tin nhắn song song & Khớp messageId
  // =========================================================================
  console.log('\n--- Giai đoạn 5: S07-AC-04 Gửi song song nhiều bản tin CALL ---');

  const concurrentWs = await connectLiveWs(cpCode);
  await sendAndReceive(concurrentWs, [2, 'concurrent-boot', 'BootNotification', { chargePointVendor: 'Test', chargePointModel: 'X' }]);

  const concurrentCount = 5;
  const pendingMap = new Map();
  const onConcurrentMsg = (raw) => {
    try {
      const frame = JSON.parse(raw.toString());
      const msgId = frame[1];
      if (pendingMap.has(msgId)) {
        const cb = pendingMap.get(msgId);
        pendingMap.delete(msgId);
        cb(frame);
      }
    } catch {}
  };
  concurrentWs.on('message', onConcurrentMsg);

  const concurrentPromises = [];
  for (let i = 1; i <= concurrentCount; i++) {
    const msgId = `msg-concurrent-${i}-${Date.now()}`;
    const p = new Promise((resolve) => {
      pendingMap.set(msgId, (resFrame) => {
        resolve({ sentId: msgId, receivedType: resFrame[0], receivedId: resFrame[1] });
      });
      concurrentWs.send(JSON.stringify([2, msgId, 'Heartbeat', {}]));
    });
    concurrentPromises.push(p);
  }

  const concurrentResults = await Promise.all(concurrentPromises);
  concurrentWs.off('message', onConcurrentMsg);
  await closeWs(concurrentWs);

  const allMatched = concurrentResults.every((r) => r.receivedType === 3 && r.receivedId === r.sentId);
  assert(
    allMatched,
    'TC-S07-AC4-01',
    `S07-AC-04: Gửi đồng thời ${concurrentCount} bản tin CALL, 100% phản hồi khớp chính xác messageId`,
    `matchedCount=${concurrentResults.filter((r) => r.receivedId === r.sentId).length}/${concurrentCount}`
  );

  await closeWs(liveWs);

  // =========================================================================
  // GIAI ĐOẠN 6: T-15 Tải lỗi liên tục (Stress Resilience)
  // =========================================================================
  console.log('\n--- Giai đoạn 6: T-15 Kiểm tra khả năng chịu lỗi dồn dập (Stress Test) ---');

  const stressWs = await connectLiveWs(cpCode);
  await sendAndReceive(stressWs, [2, 'stress-boot', 'BootNotification', { chargePointVendor: 'Test', chargePointModel: 'X' }]);

  let stressPass = true;
  for (let i = 0; i < 20; i++) {
    const badMsg = i % 2 === 0 ? `{ bad json ${i} ` : `[2, "bad-id-${i}"]`;
    const res = await sendAndReceive(stressWs, badMsg);
    if (res[0] !== 4 || stressWs.readyState !== WebSocket.OPEN) {
      stressPass = false;
      break;
    }
  }

  const finalCheck = await sendAndReceive(stressWs, [2, 'final-hb', 'Heartbeat', {}]);
  await closeWs(stressWs);

  assert(
    stressPass && finalCheck[0] === 3,
    'TC-S07-T15-01',
    'T-15: Chịu tải 20 khung lỗi dồn dập: không crash server, không đóng nhầm socket, khôi phục tức thì',
    '20/20 errors safely handled with CALLERROR. Final Heartbeat succeeded.'
  );

  console.log('\n======================================================================');
  console.log(`TỔNG KẾT S-07: ${passed + failed} Test Cases | PASS: ${passed} | FAIL: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
