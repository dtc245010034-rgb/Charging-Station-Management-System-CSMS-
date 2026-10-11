const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { WebSocketServer } = require('ws');
const { ManagedChargePoint, parseOptions } = require('../../../tools/vcp-fleet');

const rootDir = path.resolve(__dirname, '../../..');
const composePath = path.join(rootDir, 'docker-compose.yml');
const ciPath = path.join(rootDir, '.github/workflows/ci.yml');

describe('S-26 (GYM-52): Bộ trụ ảo chạy trong docker-compose và trong CI', () => {
  describe('AC1 / T-55: Dịch vụ vcp trong docker-compose.yml', () => {
    it('docker-compose.yml định nghĩa service vcp phụ thuộc app và bảo mật mật khẩu fallback', () => {
      const composeContent = fs.readFileSync(composePath, 'utf8');
      assert.ok(composeContent.includes('vcp:'), 'docker-compose.yml phải có service vcp');
      assert.ok(composeContent.includes('image: csms_app:latest'), 'vcp phải sử dụng image đồng nhất csms_app:latest');
      assert.ok(composeContent.includes('VCP_COUNT:'), 'vcp phải nhận biến môi trường VCP_COUNT');
      assert.ok(composeContent.includes('CSMS_URL:'), 'vcp phải nhận biến môi trường CSMS_URL');
      assert.ok(composeContent.includes('VCP_PREFIX:'), 'vcp phải nhận biến môi trường VCP_PREFIX');
      assert.ok(composeContent.includes('ADMIN_EMAIL:'), 'vcp phải nhận ADMIN_EMAIL');
      assert.ok(!composeContent.includes('ADMIN_PASSWORD:-admin}'), 'Không được fallback mật khẩu yếu "admin"');
      assert.ok(composeContent.includes('ADMIN_PASSWORD:-AdminPassword12345}'), 'Phải fallback mật khẩu an toàn >= 12 ký tự');
      assert.ok(composeContent.includes('service_healthy'), 'vcp phải chờ app healthy qua condition service_healthy');
      assert.ok(composeContent.includes('/app/tools/vcp-fleet.js'), 'vcp phải thực thi tools/vcp-fleet.js');
    });

    it('tools/vcp-fleet.js phân tích đúng cấu hình và từ chối nếu thiếu thông tin xác thực quản trị', () => {
      const custom = parseOptions(
        ['--count', '10', '--prefix', 'SIM-', '--heartbeat', '45', '--email', 'adm@test.com', '--password', 'SecretPass123'],
        {}
      );
      assert.equal(custom.count, 10);
      assert.equal(custom.prefix, 'SIM-');
      assert.equal(custom.heartbeatInterval, 45);
      assert.equal(custom.email, 'adm@test.com');
      assert.equal(custom.password, 'SecretPass123');

      assert.throws(
        () => parseOptions([], { CSMS_URL: 'http://localhost:3000' }),
        /Thiếu thông tin đăng nhập quản trị/
      );
    });

    it('ManagedChargePoint: kiểm thử thực nghiệm vòng đời giao thức OCPP 1.6J và lệnh điều khiển từ xa (Event-driven)', async () => {
      // Dựng server mock OCPP 1.6 thật trên cổng ngẫu nhiên để kiểm thử hành vi thực tế
      const server = http.createServer();
      const wss = new WebSocketServer({ noServer: true });
      const receivedCalls = [];
      let clientWs = null;

      // Event listener helper để loại bỏ hoàn toàn setTimeout cứng gây Flaky test
      const callListeners = new Set();
      const responseListeners = new Set();

      function waitForCall(action, filter = null, timeoutMs = 3000) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            callListeners.delete(handler);
            reject(new Error(`Timeout ${timeoutMs}ms chờ lệnh OCPP action: ${action}`));
          }, timeoutMs);

          function handler(call) {
            if (call.action === action && (!filter || filter(call.payload))) {
              clearTimeout(timer);
              callListeners.delete(handler);
              resolve(call);
            }
          }
          callListeners.add(handler);
        });
      }

      function waitForResponse(msgId, timeoutMs = 3000) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            responseListeners.delete(handler);
            reject(new Error(`Timeout ${timeoutMs}ms chờ phản hồi cho msgId: ${msgId}`));
          }, timeoutMs);

          function handler(frame) {
            if ((frame[0] === 3 || frame[0] === 4) && frame[1] === msgId) {
              clearTimeout(timer);
              responseListeners.delete(handler);
              resolve(frame);
            }
          }
          responseListeners.add(handler);
        });
      }

      server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          clientWs = ws;
          ws.on('message', (raw) => {
            const frame = JSON.parse(raw.toString());
            if (frame[0] === 2) {
              const [, msgId, action, payload] = frame;
              const callObj = { msgId, action, payload };
              receivedCalls.push(callObj);

              if (action === 'BootNotification') {
                ws.send(JSON.stringify([3, msgId, { status: 'Accepted', interval: 60 }]));
              } else if (action === 'StatusNotification') {
                ws.send(JSON.stringify([3, msgId, {}]));
              } else if (action === 'StartTransaction') {
                const txId = payload.connectorId === 2 ? 101 : 102;
                ws.send(JSON.stringify([3, msgId, { transactionId: txId, idTagInfo: { status: 'Accepted' } }]));
              } else if (action === 'StopTransaction') {
                ws.send(JSON.stringify([3, msgId, { idTagInfo: { status: 'Accepted' } }]));
              } else if (action === 'Heartbeat') {
                ws.send(JSON.stringify([3, msgId, { currentTime: new Date().toISOString() }]));
              }

              for (const listener of Array.from(callListeners)) {
                listener(callObj);
              }
            } else if (frame[0] === 3 || frame[0] === 4) {
              for (const listener of Array.from(responseListeners)) {
                listener(frame);
              }
            }
          });
        });
      });

      server.listen(0);
      await once(server, 'listening');
      const port = server.address().port;
      const wsUrl = `ws://127.0.0.1:${port}`;

      const point = new ManagedChargePoint('VCP-TEST-001', wsUrl, 10);
      try {
        const bootPromise = waitForCall('BootNotification');
        const statusAvailPromise = waitForCall('StatusNotification', (p) => p.status === 'Available');
        await point.connect();

        // 1. Kiểm tra BootNotification & StatusNotification ban đầu
        const bootCall = await bootPromise;
        assert.equal(bootCall.action, 'BootNotification');
        const statusCall = await statusAvailPromise;
        assert.equal(statusCall.payload.status, 'Available');

        // 2. Kiểm tra RemoteStartTransaction trên đầu nối 2
        const rStartMsgId = 'cmd-start-1';
        const startCallPromise = waitForCall('StartTransaction');
        const rStartRespPromise = waitForResponse(rStartMsgId);

        clientWs.send(JSON.stringify([2, rStartMsgId, 'RemoteStartTransaction', { idTag: 'TAG-DRIVER-1', connectorId: 2 }]));

        const rStartResp = await rStartRespPromise;
        assert.equal(rStartResp[0], 3, 'CALLRESULT phải là frame type 3');
        assert.equal(rStartResp[2].status, 'Accepted', 'RemoteStart phải được chấp nhận');

        const startCall = await startCallPromise;
        assert.equal(startCall.payload.connectorId, 2, 'StartTransaction phải đúng connectorId');
        assert.equal(startCall.payload.meterStart, 10000, 'Số đo bắt đầu phiên 1 là 10.000 Wh');

        // Chờ trụ chuyển sang Charging
        const chargingCall = await waitForCall('StatusNotification', (p) => p.status === 'Charging');
        assert.equal(chargingCall.payload.connectorId, 2);
        assert.equal(point.currentTransactionId, 101, 'Trụ phải cập nhật transactionId');
        assert.equal(point.currentConnectorId, 2, 'Trụ phải nhớ connectorId của phiên');

        // 3. Khắc phục LỖI 4: RemoteStopTransaction với sai transactionId -> Phải Rejected
        const rStopInvalidId = 'cmd-stop-invalid';
        const rStopInvalidPromise = waitForResponse(rStopInvalidId);
        clientWs.send(JSON.stringify([2, rStopInvalidId, 'RemoteStopTransaction', { transactionId: 999 }]));
        const rStopInvalidResp = await rStopInvalidPromise;
        assert.equal(rStopInvalidResp[2].status, 'Rejected', 'Phải từ chối Rejected khi sai transactionId');
        assert.equal(point.currentTransactionId, 101, 'Phiên sạc không được bị hủy');

        // 4. Khắc phục LỖI 4 & 5: RemoteStopTransaction đúng txId -> Phải Accepted, giải phóng đúng connectorId
        const rStopValidId = 'cmd-stop-valid';
        const stopCallPromise = waitForCall('StopTransaction');
        const rStopValidPromise = waitForResponse(rStopValidId);
        clientWs.send(JSON.stringify([2, rStopValidId, 'RemoteStopTransaction', { transactionId: 101 }]));

        const rStopValidResp = await rStopValidPromise;
        assert.equal(rStopValidResp[2].status, 'Accepted', 'RemoteStop đúng txId phải Accepted');

        const stopCall = await stopCallPromise;
        assert.equal(stopCall.payload.transactionId, 101);
        assert.equal(stopCall.payload.meterStop, 12500, 'Chỉ số đo phiên 1 phải tăng lên 12.500 Wh');
        assert.equal(stopCall.payload.reason, 'Remote');

        // Chờ StatusNotification Available trên đúng đầu nối 2 (LỖI 5)
        const availCall = await waitForCall('StatusNotification', (p) => p.status === 'Available');
        assert.equal(availCall.payload.connectorId, 2, 'Đầu nối 2 phải trở về Available, không bị kẹt Charging');
        assert.equal(point.currentTransactionId, null, 'Trụ phải giải phóng session sau khi stop');

        // 5. Khắc phục LỖI 2: Phiên sạc 2 không được reset về 10.000 Wh mà phải tiếp nối từ 12.500 Wh
        const rStart2MsgId = 'cmd-start-2';
        const start2CallPromise = waitForCall('StartTransaction');
        clientWs.send(JSON.stringify([2, rStart2MsgId, 'RemoteStartTransaction', { idTag: 'TAG-DRIVER-2', connectorId: 1 }]));

        const start2Call = await start2CallPromise;
        assert.equal(start2Call.payload.meterStart, 12500, 'LỖI 2 ĐÃ SỬA: Phiên 2 bắt đầu từ 12.500 Wh, không bị tụt lùi về 10.000 Wh');

        await waitForCall('StatusNotification', (p) => p.status === 'Charging');
        assert.equal(point.currentTransactionId, 102);

        // Dừng phiên 2
        const rStop2MsgId = 'cmd-stop-2';
        const stop2CallPromise = waitForCall('StopTransaction');
        clientWs.send(JSON.stringify([2, rStop2MsgId, 'RemoteStopTransaction', { transactionId: 102 }]));
        const stop2Call = await stop2CallPromise;
        assert.equal(stop2Call.payload.meterStop, 15000, 'Số đo sau phiên 2 phải là 15.000 Wh');

        await waitForCall('StatusNotification', (p) => p.status === 'Available');
        assert.equal(point.currentTransactionId, null);

        // 6. Kiểm tra lệnh không hỗ trợ -> Phải trả về CALLERROR NotImplemented
        const unknownMsgId = 'cmd-unknown-1';
        const unknownPromise = waitForResponse(unknownMsgId);
        clientWs.send(JSON.stringify([2, unknownMsgId, 'UnlockConnector', { connectorId: 1 }]));

        const unknownResponse = await unknownPromise;
        assert.equal(unknownResponse[0], 4, 'Phải trả về frame type 4 (CALLERROR)');
        assert.equal(unknownResponse[2], 'NotImplemented', 'ErrorCode phải là NotImplemented');
      } finally {
        await point.shutdown();
        wss.close();
        server.close();
      }
    });

    it('ManagedChargePoint: thuật toán Exponential Backoff đảm bảo sàn độ trễ tối thiểu >= 1000ms (LỖI 6)', () => {
      const point = new ManagedChargePoint('VCP-BACKOFF-001', 'ws://127.0.0.1:9999', 10);
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        for (let iter = 0; iter < 20; iter += 1) {
          const delay = point.calculateBackoffDelay(attempt);
          assert.ok(delay >= 1000, `Delay (${delay}ms) phải >= 1000ms sàn tối thiểu (attempt ${attempt})`);
          assert.ok(delay <= 30000, `Delay (${delay}ms) không vượt quá trần 30.000ms`);
        }
      }
    });

    it('ManagedChargePoint: xử lý ngắt kết nối an toàn, không bị treo vĩnh viễn khi cổng đóng', async () => {
      // Thử kết nối tới cổng không có máy chủ nghe (connection refused)
      const point = new ManagedChargePoint('VCP-ERR-001', 'ws://127.0.0.1:59999', 10);
      try {
        await assert.rejects(
          () => point.connect(),
          /Socket bị đóng trước khi mở|ECONNREFUSED/
        );
      } finally {
        await point.shutdown();
      }
    });
  });

  describe('AC2 / T-46: Kịch bản kiểm thử ngắt–nối với tham số mở rộng', () => {
    it('tools/test-s21-reconnect-fleet.js hỗ trợ đầy đủ --drops và --seed cho việc lặp lại kết quả', () => {
      const { optionsFromArgs } = require('../../../tools/test-s21-reconnect-fleet');
      const prevStaging = process.env.STAGING_BASE_URL;
      const prevDb = process.env.STAGING_DATABASE_URL;
      process.env.STAGING_BASE_URL = 'http://localhost:3000';
      process.env.STAGING_DATABASE_URL = 'postgresql://csms:test@localhost:5433/csms_test';

      try {
        const parsed = optionsFromArgs(['--count', '15', '--drops', '2-5', '--seed', '9876', '--prefix', 'S26-TEST-']);
        assert.equal(parsed.count, 15);
        assert.deepEqual(parsed.disconnects, [2, 5]);
        assert.equal(parsed.seed, 9876);
        assert.equal(parsed.prefix, 'S26-TEST-');
      } finally {
        if (prevStaging === undefined) delete process.env.STAGING_BASE_URL;
        else process.env.STAGING_BASE_URL = prevStaging;
        if (prevDb === undefined) delete process.env.STAGING_DATABASE_URL;
        else process.env.STAGING_DATABASE_URL = prevDb;
      }
    });
  });

  describe('AC3 / T-56: Job CI session-scenario trong GitHub Actions', () => {
    it('.github/workflows/ci.yml định nghĩa job session-scenario quản lý tiến trình bằng trap và timeout <= 5 phút', () => {
      const ciContent = fs.readFileSync(ciPath, 'utf8');
      assert.ok(ciContent.includes('session-scenario:'), 'ci.yml phải có job session-scenario');
      assert.ok(ciContent.includes('needs: lint-and-test'), 'job session-scenario phải phụ thuộc lint-and-test');
      assert.ok(ciContent.includes('timeout-minutes: 5'), 'timeout của session-scenario phải <= 5 phút');
      assert.ok(ciContent.includes('SERVER_PID=$!'), 'Phải lưu PID máy chủ để quản lý');
      assert.ok(ciContent.includes('trap "kill $SERVER_PID'), 'Phải dùng trap dọn dẹp tiến trình khi thoát step');
      assert.ok(!ciContent.includes('ALLOW_WEAK_ADMIN_PASSWORD'), 'Không được để rò rỉ cờ ALLOW_WEAK_ADMIN_PASSWORD trong CI');
      assert.ok(ciContent.includes('tools/test-s21-reconnect-fleet.js'), 'job phải chạy kịch bản test-s21-reconnect-fleet.js');
      assert.ok(ciContent.includes('--drops'), 'job CI phải truyền cờ --drops');
      assert.ok(ciContent.includes('--seed'), 'job CI phải truyền cờ --seed để đảm bảo tính lặp lại');
    });
  });
});
