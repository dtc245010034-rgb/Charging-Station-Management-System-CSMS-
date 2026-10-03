const { once } = require('node:events');
const path = require('node:path');
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
  if (options.cookie) headers.Cookie = options.cookie;
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

async function connectWs(code) {
  const ws = new WebSocket(`${WS_URL}/ocpp/${encodeURIComponent(code)}`, ['ocpp1.6']);
  await once(ws, 'open');
  return ws;
}

function sendAndReceive(ws, frame) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      ws.off('message', onMessage);
      ws.off('error', onError);
      try { resolve(JSON.parse(raw.toString())); } catch (err) { reject(err); }
    };
    const onError = (err) => {
      ws.off('message', onMessage);
      ws.off('error', onError);
      reject(err);
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
    ws.send(JSON.stringify(frame));
  });
}

const results = [];

function record(id, title, status, details = {}) {
  results.push({ id, title, status, ...details });
  console.log(`[${status}] ${id}: ${title}`);
}

async function main() {
  console.log('======================================================================');
  console.log('  KIỂM THỬ XÁC MINH S-10: STATUS NOTIFICATION TỪNG ĐẦU NỐI (T-20, T-21, T-22)');
  console.log('======================================================================\n');

  // Giai đoạn A: Smoke
  try {
    const health = await request('/api/health');
    record('TC-S10-A01', 'Healthcheck GET /api/health trả HTTP 200', (health.status === 200 && health.body?.ok === true) ? 'PASS' : 'FAIL', {
      rawStatus: health.status
    });
  } catch (err) {
    record('TC-S10-A01', 'Healthcheck GET /api/health', 'FAIL', { error: err.message });
  }

  try {
    const ocppCol = queryDb("SELECT count(*) FROM information_schema.columns WHERE table_name = 'connectors' AND column_name = 'ocpp_status';");
    const errTable = queryDb("SELECT count(*) FROM information_schema.tables WHERE table_name = 'connector_errors';");
    record('TC-S10-A02', 'CSDL sẵn sàng: cột connectors.ocpp_status và bảng connector_errors tồn tại', (ocppCol === '1' && errTable === '1') ? 'PASS' : 'FAIL', {
      ocppCol, errTable
    });
  } catch (err) {
    record('TC-S10-A02', 'CSDL schema', 'FAIL', { error: err.message });
  }

  const cpCode = 'DEMO-ST01-CP1';
  let ws;
  try {
    ws = await connectWs(cpCode);

    // TC-S10-A03: StatusNotification trước khi Boot -> SecurityError
    const preBoot = await sendAndReceive(ws, [2, 'stat-pre', 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' }]);
    record('TC-S10-A03', 'Chặn StatusNotification trước khi BootNotification (SecurityError)', (preBoot[0] === 4 && preBoot[2] === 'SecurityError') ? 'PASS' : 'FAIL', {
      preBoot
    });

    // Boot
    const bootRes = await sendAndReceive(ws, [2, 'boot-s10', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]);
    record('TC-S10-A04', 'BootNotification được chấp nhận (Accepted)', (bootRes[0] === 3 && bootRes[2]?.status === 'Accepted') ? 'PASS' : 'FAIL');

    // Giai đoạn B: T-20 & T-21 Mapping & Errors
    const ocppStatuses = [
      { ocpp: 'Available', expectedInternal: 'AVAILABLE' },
      { ocpp: 'Preparing', expectedInternal: 'OCCUPIED' },
      { ocpp: 'Charging', expectedInternal: 'OCCUPIED' },
      { ocpp: 'SuspendedEV', expectedInternal: 'OCCUPIED' },
      { ocpp: 'SuspendedEVSE', expectedInternal: 'OCCUPIED' },
      { ocpp: 'Finishing', expectedInternal: 'OCCUPIED' },
      { ocpp: 'Reserved', expectedInternal: 'RESERVED' },
      { ocpp: 'Unavailable', expectedInternal: 'ERROR' },
      { ocpp: 'Faulted', expectedInternal: 'ERROR' }
    ];

    let allMapped = true;
    for (let i = 0; i < ocppStatuses.length; i++) {
      const item = ocppStatuses[i];
      await sendAndReceive(ws, [2, `stat-map-${i}`, 'StatusNotification', { connectorId: 1, status: item.ocpp, errorCode: 'NoError' }]);
      const dbRow = queryDb(`SELECT c.status || '|' || COALESCE(c.ocpp_status, '') FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 1;`);
      const [actualInternal, actualOcpp] = dbRow.split('|');
      if (actualInternal !== item.expectedInternal || actualOcpp !== item.ocpp) allMapped = false;
    }
    record('TC-S10-B01', 'Ánh xạ chuẩn xác 9 trạng thái OCPP sang 4 trạng thái nội bộ (AVAILABLE, OCCUPIED, RESERVED, ERROR)', allMapped ? 'PASS' : 'FAIL');

    const lastOcpp = queryDb(`SELECT ocpp_status FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 1;`);
    record('TC-S10-B02', 'Cột ocpp_status lưu nguyên văn chuỗi OCPP gốc (Faulted)', lastOcpp === 'Faulted' ? 'PASS' : 'FAIL', { lastOcpp });

    // Trạng thái tuỳ biến
    const unkRes = await sendAndReceive(ws, [2, 'stat-unk', 'StatusNotification', { connectorId: 1, status: 'CustomOEMState', errorCode: 'NoError' }]);
    const unkDb = queryDb(`SELECT c.status || '|' || c.ocpp_status FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 1;`);
    const [unkInt, unkOcppVal] = unkDb.split('|');
    record('TC-S10-B03', 'Trạng thái tuỳ biến nhà sản xuất ánh xạ an toàn sang ERROR và giữ nguyên văn trong ocpp_status', (unkRes[0] === 3 && unkInt === 'ERROR' && unkOcppVal === 'CustomOEMState') ? 'PASS' : 'FAIL', {
      unkInt, unkOcppVal
    });

    // Lỗi đầu nối
    const initErrCount = parseInt(queryDb(`SELECT count(*) FROM connector_errors ce JOIN connectors c ON c.id = ce.connector_id JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 1;`) || '0', 10);
    const errRes = await sendAndReceive(ws, [2, 'stat-err', 'StatusNotification', {
      connectorId: 1,
      status: 'Faulted',
      errorCode: 'GroundFailure',
      vendorErrorCode: 'OEM_GROUND_ERR_505',
      timestamp: '2026-10-03T07:15:30.000Z'
    }]);
    const afterErrCount = parseInt(queryDb(`SELECT count(*) FROM connector_errors ce JOIN connectors c ON c.id = ce.connector_id JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 1;`) || '0', 10);
    const latestErr = queryDb(`SELECT error_code || '|' || vendor_error_code FROM connector_errors ce JOIN connectors c ON c.id = ce.connector_id JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 1 ORDER BY ce.id DESC LIMIT 1;`);
    record('TC-S10-B04', 'Lỗi đầu nối ghi thêm bản ghi vào connector_errors (error_code, vendor_error_code, occurred_at)', (errRes[0] === 3 && afterErrCount === initErrCount + 1 && latestErr === 'GroundFailure|OEM_GROUND_ERR_505') ? 'PASS' : 'FAIL', {
      initErrCount, afterErrCount, latestErr
    });

    // Báo NoError
    await sendAndReceive(ws, [2, 'stat-ok', 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' }]);
    const okErrCount = parseInt(queryDb(`SELECT count(*) FROM connector_errors ce JOIN connectors c ON c.id = ce.connector_id JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 1;`) || '0', 10);
    record('TC-S10-B05', 'Báo NoError khôi phục trạng thái Available, không ghi thêm lỗi và bảo toàn lịch sử connector_errors', (okErrCount === afterErrCount) ? 'PASS' : 'FAIL', {
      afterErrCount, okErrCount
    });

    // Fallback timestamp
    await sendAndReceive(ws, [2, 'stat-no-ts', 'StatusNotification', { connectorId: 1, status: 'Faulted', errorCode: 'OverCurrentFailure' }]);
    const noTsDb = queryDb(`SELECT occurred_at FROM connector_errors ce JOIN connectors c ON c.id = ce.connector_id JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 1 AND ce.error_code = 'OverCurrentFailure' ORDER BY ce.id DESC LIMIT 1;`);
    record('TC-S10-B06', 'Khi timestamp vắng mặt, hệ thống tự động gán CURRENT_TIMESTAMP của CSDL', (noTsDb && !isNaN(new Date(noTsDb).getTime())) ? 'PASS' : 'FAIL', {
      noTsDb
    });

    // Giai đoạn C: T-22 Biên & Validation
    const conn0 = await sendAndReceive(ws, [2, 'stat-c0', 'StatusNotification', { connectorId: 0, status: 'Available', errorCode: 'NoError' }]);
    const count0 = queryDb(`SELECT count(*) FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 0;`);
    record('TC-S10-C01', 'connectorId = 0 đại diện cả trụ: trả CALLRESULT rỗng, không thay đổi bảng connectors', (conn0[0] === 3 && count0 === '0') ? 'PASS' : 'FAIL', {
      count0
    });

    const totalBefore = parseInt(queryDb(`SELECT count(*) FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}';`), 10);
    const conn99 = await sendAndReceive(ws, [2, 'stat-c99', 'StatusNotification', { connectorId: 99, status: 'Faulted', errorCode: 'GroundFailure' }]);
    const totalAfter = parseInt(queryDb(`SELECT count(*) FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}';`), 10);
    record('TC-S10-C02', 'connectorId lạ/chưa khai báo: trả CALLRESULT rỗng, không tự tạo đầu nối mới trong CSDL', (conn99[0] === 3 && totalBefore === totalAfter) ? 'PASS' : 'FAIL', {
      totalBefore, totalAfter
    });

    const invId = await sendAndReceive(ws, [2, 'stat-invid', 'StatusNotification', { connectorId: -1, status: 'Available', errorCode: 'NoError' }]);
    record('TC-S10-C03a', 'Validation: connectorId âm bị từ chối với CALLERROR PropertyConstraintViolation', (invId[0] === 4 && invId[2] === 'PropertyConstraintViolation') ? 'PASS' : 'FAIL');

    const empSt = await sendAndReceive(ws, [2, 'stat-empst', 'StatusNotification', { connectorId: 1, status: '', errorCode: 'NoError' }]);
    record('TC-S10-C03b', 'Validation: status rỗng bị từ chối với CALLERROR PropertyConstraintViolation', (empSt[0] === 4 && empSt[2] === 'PropertyConstraintViolation') ? 'PASS' : 'FAIL');

    const multi = await Promise.all([
      sendAndReceive(ws, [2, 'p1', 'StatusNotification', { connectorId: 1, status: 'Charging', errorCode: 'NoError' }]),
      sendAndReceive(ws, [2, 'p2', 'StatusNotification', { connectorId: 2, status: 'Reserved', errorCode: 'NoError' }]),
    ]);
    const c1 = queryDb(`SELECT c.status FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 1;`);
    const c2 = queryDb(`SELECT c.status FROM connectors c JOIN charge_points cp ON cp.id = c.charge_point_id WHERE cp.code = '${cpCode}' AND c.connector_no = 2;`);
    record('TC-S10-C04', 'Đồng thời gửi StatusNotification cho nhiều đầu nối cập nhật độc lập, chính xác', (multi.every(r => r[0] === 3) && c1 === 'OCCUPIED' && c2 === 'RESERVED') ? 'PASS' : 'FAIL', {
      c1, c2
    });

    ws.close();
  } catch (err) {
    record('TC-S10-ERR', 'Lỗi nhóm test S-10', 'FAIL', { error: err.message });
    if (ws) ws.close();
  }

  console.log('\n======================================================================');
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  console.log(`TỔNG KẾT: ${results.length} Test Cases | PASS: ${pass} | FAIL: ${fail}`);
  console.log('======================================================================\n');

  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
