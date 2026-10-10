/**
 * Independent Live Server Verification Script for S-18
 * Tests StopTransaction on the actual running CSMS service via WebSocket and PostgreSQL.
 */
const { WebSocket } = require('ws');
const { Client } = require('pg');

const WS_URL = process.env.WS_URL || 'ws://localhost:3000';
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('Cần đặt biến môi trường DATABASE_URL, ví dụ postgres://csms:<mật_khẩu>@127.0.0.1:5434/csms');

let msgCounter = 1;
function nextMsgId() {
  return `msg-s18-${Date.now()}-${msgCounter++}`;
}

function sendCall(ws, action, payload, customId = null) {
  const msgId = customId || nextMsgId();
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const frame = JSON.parse(data.toString());
        if (frame[1] === msgId) {
          ws.off('message', handler);
          resolve(frame);
        }
      } catch (err) {
        // ignore
      }
    };
    ws.on('message', handler);
    const frame = [2, msgId, action, payload];
    ws.send(JSON.stringify(frame));
    setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for response to ${action} (msgId: ${msgId})`));
    }, 5000);
  });
}

function connectChargePoint(code) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/ocpp/${code}`, ['ocpp1.6']);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function run() {
  console.log('=== BẮT ĐẦU KIỂM THỬ THỰC TẾ S-18 TRÊN LIVE SERVER ===\n');
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  const results = [];
  function record(testName, passed, details = '') {
    results.push({ testName, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} | ${testName} ${details ? '(' + details + ')' : ''}`);
  }

  try {
    // 1. Setup charge points
    const cp1Code = 'DEMO-ST01-CP1';
    const cp2Code = 'DEMO-ST01-CP2';

    const ws1 = await connectChargePoint(cp1Code);
    const ws2 = await connectChargePoint(cp2Code);

    // Boot both
    const boot1 = await sendCall(ws1, 'BootNotification', {
      chargePointVendor: 'TestVendor',
      chargePointModel: 'TestModel',
    });
    record('BootNotification CP1', boot1[0] === 3 && boot1[2].status === 'Accepted');

    const boot2 = await sendCall(ws2, 'BootNotification', {
      chargePointVendor: 'TestVendor',
      chargePointModel: 'TestModel',
    });
    record('BootNotification CP2', boot2[0] === 3 && boot2[2].status === 'Accepted');

    // TEST 1: Normal Start and Stop Transaction
    console.log('\n--- TEST 1: Luồng chuẩn StopTransaction (AC1) ---');
    const start1 = await sendCall(ws1, 'StartTransaction', {
      connectorId: 1,
      idTag: 'TAG-DEMO-01',
      meterStart: 1000,
      timestamp: new Date().toISOString(),
    });
    const txId1 = start1[2]?.transactionId;
    record('StartTransaction trả transactionId', typeof txId1 === 'number' && txId1 > 0, `txId: ${txId1}`);

    const stopTime1 = new Date().toISOString();
    const stop1 = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId1,
      meterStop: 2500,
      timestamp: stopTime1,
      reason: 'Local',
    });
    record('StopTransaction trả CALLRESULT rỗng', stop1[0] === 3 && Object.keys(stop1[2]).length === 0);

    const dbSession1 = (await db.query('SELECT * FROM charging_sessions WHERE id = $1', [txId1])).rows[0];
    record('DB cập nhật status = COMPLETED', dbSession1.status === 'COMPLETED');
    record('DB cập nhật meter_stop = 2500 Wh', Number(dbSession1.meter_stop) === 2500);
    record('DB cập nhật stop_reason = Local', dbSession1.stop_reason === 'Local');
    record('DB needs_review = false khi thẻ hợp lệ', dbSession1.needs_review === false, `review_reason: ${dbSession1.review_reason}`);

    // TEST 2: Gửi lại cùng messageId (S-14 deduplication) và gửi lại với messageId mới (Idempotency)
    console.log('\n--- TEST 2: Gửi lại tin (AC4 & Idempotency) ---');
    const dupMsgId = 'dup-msg-s18-test';
    const firstCall = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId1,
      meterStop: 2500,
      timestamp: stopTime1,
      reason: 'Local',
    }, dupMsgId);
    const secondCall = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId1,
      meterStop: 2500,
      timestamp: stopTime1,
      reason: 'Local',
    }, dupMsgId);
    record('Gửi lại cùng messageId trả đúng kết quả cache', secondCall[0] === 3 && JSON.stringify(firstCall) === JSON.stringify(secondCall));

    const newMsgResend = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId1,
      meterStop: 9999, // Cố tình gửi số khác
      timestamp: new Date().toISOString(),
      reason: 'Remote',
    });
    record('Gửi lại với messageId mới vẫn trả CALLRESULT rỗng', newMsgResend[0] === 3);
    const dbSession1After = (await db.query('SELECT meter_stop, stop_reason FROM charging_sessions WHERE id = $1', [txId1])).rows[0];
    record('DB KHÔNG bị ghi đè dữ liệu cũ khi gửi lại', Number(dbSession1After.meter_stop) === 2500 && dbSession1After.stop_reason === 'Local');

    // TEST 3: Số đo cuối nhỏ hơn số đo đầu (METER_STOP_BELOW_START)
    console.log('\n--- TEST 3: Số đo lùi (AC2) ---');
    const start2 = await sendCall(ws1, 'StartTransaction', {
      connectorId: 1,
      idTag: 'DRIVER-CARD-01',
      meterStart: 5000,
      timestamp: new Date().toISOString(),
    });
    const txId2 = start2[2]?.transactionId;
    const stop2 = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId2,
      meterStop: 4000, // Nhỏ hơn 5000
      timestamp: new Date().toISOString(),
      reason: 'PowerLoss',
    });
    record('StopTransaction số đo lùi trả CALLRESULT rỗng', stop2[0] === 3);
    const dbSession2 = (await db.query('SELECT * FROM charging_sessions WHERE id = $1', [txId2])).rows[0];
    record('DB status = COMPLETED cho số đo lùi', dbSession2.status === 'COMPLETED');
    record('DB bật needs_review = true', dbSession2.needs_review === true);
    record('DB review_reason có METER_STOP_BELOW_START', dbSession2.review_reason && dbSession2.review_reason.includes('METER_STOP_BELOW_START'), dbSession2.review_reason);

    // TEST 4: Lệch giờ > 24h (CLOCK_SKEW / D6)
    console.log('\n--- TEST 4: Lệch giờ > 24h (D6) ---');
    const start3 = await sendCall(ws1, 'StartTransaction', {
      connectorId: 1,
      idTag: 'DRIVER-CARD-01',
      meterStart: 1000,
      timestamp: new Date().toISOString(),
    });
    const txId3 = start3[2]?.transactionId;
    const skewDate = '2020-01-01T00:00:00.000Z';
    const stop3 = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId3,
      meterStop: 1500,
      timestamp: skewDate,
      reason: 'Local',
    });
    record('StopTransaction lệch giờ trả CALLRESULT rỗng', stop3[0] === 3);
    const dbSession3 = (await db.query('SELECT * FROM charging_sessions WHERE id = $1', [txId3])).rows[0];
    record('DB bật needs_review = true do lệch giờ', dbSession3.needs_review === true);
    record('DB review_reason có CLOCK_SKEW', dbSession3.review_reason && dbSession3.review_reason.includes('CLOCK_SKEW'), dbSession3.review_reason);
    const stoppedYear = new Date(dbSession3.stopped_at).getFullYear();
    record('DB stopped_at dùng giờ server hiện tại (không dùng 2020)', stoppedYear >= 2026, `year: ${stoppedYear}`);

    // TEST 5: transactionId không tồn tại (Orphan + che mã thẻ)
    console.log('\n--- TEST 5: transactionId không tồn tại (D3 & Q2) ---');
    const secretTag = 'MY-SECRET-RFID-9988';
    const unknownStop = await sendCall(ws1, 'StopTransaction', {
      transactionId: 2147483000,
      meterStop: 100,
      timestamp: new Date().toISOString(),
      idTag: secretTag,
    });
    record('StopTransaction lạ trả CALLRESULT rỗng (không throw CallError)', unknownStop[0] === 3);
    const orphan = (await db.query(
      `SELECT * FROM orphan_messages WHERE charge_point_id = (SELECT id FROM charge_points WHERE code = $1) AND reason = 'UNKNOWN_TRANSACTION' ORDER BY id DESC LIMIT 1`,
      [cp1Code]
    )).rows[0];
    record('orphan_messages ghi UNKNOWN_TRANSACTION', orphan !== undefined && orphan.reason === 'UNKNOWN_TRANSACTION');
    record('Mã thẻ trong orphan_messages được che 4 số cuối', orphan && orphan.payload.idTag === '***************9988');
    record('Bảo mật: Plaintext mã thẻ không tồn tại trong DB', orphan && !JSON.stringify(orphan.payload).includes('SECRET'));

    // TEST 6: Trụ khác gửi StopTransaction mạo danh (D12)
    console.log('\n--- TEST 6: Trụ gửi không phải chủ sở hữu phiên (D12) ---');
    const start4 = await sendCall(ws1, 'StartTransaction', {
      connectorId: 1,
      idTag: 'DRIVER-CARD-01',
      meterStart: 1000,
      timestamp: new Date().toISOString(),
    });
    const txId4 = start4[2]?.transactionId;

    // CP2 cố gắng gửi StopTransaction cho txId4 của CP1
    const attackStop = await sendCall(ws2, 'StopTransaction', {
      transactionId: txId4,
      meterStop: 9999,
      timestamp: new Date().toISOString(),
      reason: 'Remote',
    });
    record('Trụ lạ gửi StopTransaction vẫn nhận CALLRESULT rỗng', attackStop[0] === 3);
    const dbSession4 = (await db.query('SELECT status, meter_stop FROM charging_sessions WHERE id = $1', [txId4])).rows[0];
    record('Phiên gốc trên CP1 KHÔNG bị thay đổi (vẫn CHARGING)', dbSession4.status === 'CHARGING' && dbSession4.meter_stop === null);
    const orphanAttack = (await db.query(
      `SELECT * FROM orphan_messages WHERE charge_point_id = (SELECT id FROM charge_points WHERE code = $1) AND reason = 'CHARGE_POINT_MISMATCH' ORDER BY id DESC LIMIT 1`,
      [cp2Code]
    )).rows[0];
    record('orphan_messages ghi nhận CHARGE_POINT_MISMATCH cho CP2', orphanAttack !== undefined);

    // Clean up session 4
    await sendCall(ws1, 'StopTransaction', {
      transactionId: txId4,
      meterStop: 1200,
      timestamp: new Date().toISOString(),
      reason: 'Local',
    });

    // TEST 7: Kiểm tra Reason enum chuẩn OCPP 1.6: "DeAuthorized"
    console.log('\n--- TEST 7: Kiểm tra Reason chuẩn OCPP 1.6 ("DeAuthorized") ---');
    const start5 = await sendCall(ws1, 'StartTransaction', {
      connectorId: 1,
      idTag: 'DRIVER-CARD-01',
      meterStart: 1000,
      timestamp: new Date().toISOString(),
    });
    const txId5 = start5[2]?.transactionId;
    const deauthStop = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId5,
      meterStop: 1100,
      timestamp: new Date().toISOString(),
      reason: 'DeAuthorized',
    });
    const isDeauthAccepted = deauthStop[0] === 3;
    record(
      'OCPP 1.6 Reason "DeAuthorized" được chấp nhận',
      isDeauthAccepted,
      deauthStop[0] === 4 ? `Lỗi: ${deauthStop[2]} - ${deauthStop[3]}` : 'Accepted'
    );

    // TEST 8: Kiểm tra validation constraints
    console.log('\n--- TEST 8: Kiểm tra ràng buộc và từ chối lỗi (Validation) ---');
    const invalidReason = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId1,
      meterStop: 1000,
      timestamp: new Date().toISOString(),
      reason: 'InvalidReasonFake',
    });
    record('Reason không hợp lệ trả PropertyConstraintViolation', invalidReason[0] === 4 && invalidReason[2] === 'PropertyConstraintViolation');

    const negMeter = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId1,
      meterStop: -50,
      timestamp: new Date().toISOString(),
    });
    record('meterStop âm trả PropertyConstraintViolation', negMeter[0] === 4 && negMeter[2] === 'PropertyConstraintViolation');

    const floatMeter = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId1,
      meterStop: 123.45,
      timestamp: new Date().toISOString(),
    });
    record('meterStop số thực trả PropertyConstraintViolation', floatMeter[0] === 4 && floatMeter[2] === 'PropertyConstraintViolation');

    const unsafeMeter = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId1,
      meterStop: 1e25,
      timestamp: new Date().toISOString(),
    });
    record('meterStop vượt safe integer trả PropertyConstraintViolation', unsafeMeter[0] === 4 && unsafeMeter[2] === 'PropertyConstraintViolation');

    const longTag = await sendCall(ws1, 'StopTransaction', {
      transactionId: txId1,
      meterStop: 1000,
      timestamp: new Date().toISOString(),
      idTag: 'A'.repeat(25),
    });
    record('idTag dài hơn 20 ký tự trả PropertyConstraintViolation', longTag[0] === 4 && longTag[2] === 'PropertyConstraintViolation');

    // TEST 9: Kiểm tra hàm calculateEnergyKwh và tương thích kiểu dữ liệu từ PostgreSQL
    console.log('\n--- TEST 9: Kiểm tra hàm thuần calculateEnergyKwh & PostgreSQL Data Types (T-39) ---');
    const { calculateEnergyKwh } = require('../../backend/src/modules/sessions/energy');
    
    // Ca số nguyên bình thường
    record('calculateEnergyKwh(1000, 2500) = 1.5 kWh', calculateEnergyKwh(1000, 2500) === 1.5);
    record('calculateEnergyKwh(1000, 1000) = 0 kWh', calculateEnergyKwh(1000, 1000) === 0);
    record('calculateEnergyKwh(2500, 1000) = null', calculateEnergyKwh(2500, 1000) === null);

    // Kiểm tra tương thích với dữ liệu thực tế từ PostgreSQL (kiểu BIGINT trả về string qua pg driver)
    const rawPgRow = (await db.query('SELECT meter_start, meter_stop FROM charging_sessions WHERE id = $1', [txId1])).rows[0];
    const isMeterStartString = typeof rawPgRow.meter_start === 'string';
    record('PostgreSQL driver trả về meter_start dạng string', isMeterStartString, `type: ${typeof rawPgRow.meter_start}, value: ${rawPgRow.meter_start}`);

    let kwhFromPg = null;
    let successOnPgString = false;
    try {
      kwhFromPg = calculateEnergyKwh(rawPgRow.meter_start, rawPgRow.meter_stop);
      successOnPgString = kwhFromPg === 1.5;
    } catch (err) {
      successOnPgString = false;
    }
    record(
      'calculateEnergyKwh tương thích hoàn hảo với dữ liệu string từ PostgreSQL driver',
      successOnPgString,
      successOnPgString ? `Tính đúng ${kwhFromPg} kWh` : 'Lỗi ngoại lệ'
    );

    ws1.close();
    ws2.close();
  } finally {
    await db.end();
  }

  console.log('\n=== TỔNG KẾT KIỂM THỬ S-18 TRÊN SERVER THẬT ===');
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Tổng số ca: ${results.length} | Đạt: ${passedCount} | Thất bại: ${failedCount}`);

  return { passedCount, failedCount, results };
}

run().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
