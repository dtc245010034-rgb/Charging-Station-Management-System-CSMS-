const http = require('node:http');
const { once } = require('node:events');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket, WebSocketServer } = require('ws');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createOcppUpgradeHandler } = require('../../src/modules/ocpp/ocpp-upgrade');
const { createBootNotificationHandler } = require('../../src/modules/ocpp/handlers/boot-notification');

describe('S-08 (T-16 & T-17): BootNotification handler và kiểm soát phiên', () => {
  let server;
  let wss;
  let url;
  let ocppMessages;
  const clients = new Set();

  // Bảng dữ liệu bộ nhớ giả lập cho test
  const dbChargePoints = new Map();
  const dbStations = new Map();

  function resetMockDb() {
    dbStations.clear();
    dbChargePoints.clear();

    // Trạm 1: Đang hoạt động, không bị khoá
    dbStations.set(1, { id: 1, name: 'Trạm Cầu Giấy', status: 'ACTIVE', locked_at: null });
    // Trạm 2: Đang bị quản trị viên khoá
    dbStations.set(2, { id: 2, name: 'Trạm Ba Đình (Khóa)', status: 'ACTIVE', locked_at: new Date('2026-10-01T10:00:00.000Z') });

    // Trụ 1: Thuộc Trạm 1
    dbChargePoints.set('CP-ACTIVE-01', {
      id: 101,
      code: 'CP-ACTIVE-01',
      station_id: 1,
      vendor: null,
      model: null,
      firmware_version: null,
      status: 'UNKNOWN',
    });

    // Trụ 2: Thuộc Trạm 2 (trạm bị khoá)
    dbChargePoints.set('CP-LOCKED-01', {
      id: 102,
      code: 'CP-LOCKED-01',
      station_id: 2,
      vendor: null,
      model: null,
      firmware_version: null,
      status: 'UNKNOWN',
    });
  }

  // Mock pool truy vấn trực tiếp map dbChargePoints / dbStations
  const mockPool = {
    query: async (sql, params = []) => {
      if (sql.includes('SELECT cp.id, cp.code')) {
        const code = params[0];
        const cp = dbChargePoints.get(code);
        if (!cp) return { rows: [] };
        const st = dbStations.get(cp.station_id);
        return {
          rows: [
            {
              id: cp.id,
              code: cp.code,
              status: cp.status,
              station_id: cp.station_id,
              station_status: st?.status,
              locked_at: st?.locked_at,
            },
          ],
        };
      }
      if (sql.includes('UPDATE charge_points')) {
        const [vendor, model, firmwareVersion, id] = params;
        for (const cp of dbChargePoints.values()) {
          if (cp.id === id) {
            cp.vendor = vendor;
            cp.model = model;
            cp.firmware_version = firmwareVersion;
            cp.status = 'ONLINE';
            break;
          }
        }
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
  };

  async function connectClient(code) {
    const ws = new WebSocket(`${url}/ocpp/${code}`, ['ocpp1.6']);
    clients.add(ws);
    await once(ws, 'open');
    return ws;
  }

  function receiveFrame(ws) {
    return new Promise((resolve) => ws.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
  }

  async function closeClient(ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
      await once(ws, 'close');
    }
  }

  before(async () => {
    resetMockDb();

    server = http.createServer();
    wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => protocols.has('ocpp1.6') ? 'ocpp1.6' : false,
    });

    const bootHandler = createBootNotificationHandler({
      pool: mockPool,
      getHeartbeatInterval: () => 60,
    });

    ocppMessages = createOcppMessageHandler({
      handlers: {
        BootNotification: bootHandler,
        Heartbeat: async () => ({ currentTime: new Date().toISOString() }),
      },
    });

    wss.on('connection', (ws, code) => {
      ws.chargePointCode = code;
      ws.on('close', () => {
        ocppMessages.closeConnection(ws);
      });
      ws.on('message', (raw) => {
        void ocppMessages.handleMessage(ws, raw);
      });
    });

    server.on('upgrade', createOcppUpgradeHandler({
      wss,
      lookupChargePoint: async (code) => {
        const cp = dbChargePoints.get(code);
        if (!cp) return null;
        const st = dbStations.get(cp.station_id);
        return { id: cp.id, code: cp.code, station_status: st?.status };
      },
    }));

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `ws://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const client of clients) {
      await closeClient(client);
    }
    if (wss) await new Promise((resolve) => wss.close(resolve));
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
  });

  it('AC1 & T-16/T-17: Trụ gửi BootNotification hợp lệ -> Accepted, interval cấu hình, currentTime UTC, trụ ONLINE và lưu DB', async () => {
    const client = await connectClient('CP-ACTIVE-01');
    const responsePromise = receiveFrame(client);

    // Gửi BootNotification
    client.send(JSON.stringify([
      2,
      'msg-ac1-01',
      'BootNotification',
      {
        chargePointVendor: 'VinFast-Power',
        chargePointModel: 'VF-60KW',
        firmwareVersion: '1.2.3',
      },
    ]));

    const response = await responsePromise;

    // Kiểm tra cấu trúc CALLRESULT
    assert.equal(response[0], 3);
    assert.equal(response[1], 'msg-ac1-01');
    assert.equal(response[2].status, 'Accepted');
    assert.equal(response[2].interval, 60);

    // Kiểm tra currentTime là ISO 8601 và ở múi giờ UTC (kết thúc bằng Z)
    assert.match(response[2].currentTime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/);
    const date = new Date(response[2].currentTime);
    assert.equal(isNaN(date.getTime()), false, 'currentTime phải là ngày giờ hợp lệ');

    // Kiểm tra dữ liệu được lưu vào bảng charge_points
    const saved = dbChargePoints.get('CP-ACTIVE-01');
    assert.equal(saved.vendor, 'VinFast-Power');
    assert.equal(saved.model, 'VF-60KW');
    assert.equal(saved.firmware_version, '1.2.3');
    assert.equal(saved.status, 'ONLINE', 'Cột trạng thái phải chuyển sang ONLINE');

    await closeClient(client);
  });

  it('T-16 phi chức năng: Trường thiếu trong BootNotification vẫn được chấp nhận và lưu rỗng', async () => {
    // Đăng ký thêm trụ mới để test
    dbChargePoints.set('CP-MISSING-01', {
      id: 103,
      code: 'CP-MISSING-01',
      station_id: 1,
      vendor: null,
      model: null,
      firmware_version: null,
      status: 'UNKNOWN',
    });

    const client = await connectClient('CP-MISSING-01');
    const responsePromise = receiveFrame(client);

    // Gửi BootNotification thiếu trường model và firmwareVersion
    client.send(JSON.stringify([
      2,
      'msg-missing-01',
      'BootNotification',
      {
        chargePointVendor: 'OnlyVendor',
      },
    ]));

    const response = await responsePromise;
    assert.equal(response[0], 3);
    assert.equal(response[2].status, 'Accepted');

    const saved = dbChargePoints.get('CP-MISSING-01');
    assert.equal(saved.vendor, 'OnlyVendor');
    assert.equal(saved.model, '', 'Trường thiếu phải lưu rỗng');
    assert.equal(saved.firmware_version, '', 'Trường thiếu phải lưu rỗng');
    assert.equal(saved.status, 'ONLINE');

    await closeClient(client);
  });

  it('AC2: Trụ thuộc trạm bị quản trị viên khoá gửi BootNotification -> Rejected, và trụ KHÔNG được coi là trực tuyến', async () => {
    const client = await connectClient('CP-LOCKED-01');
    const responsePromise = receiveFrame(client);

    // Gửi BootNotification từ trụ thuộc trạm bị khoá
    client.send(JSON.stringify([
      2,
      'msg-ac2-01',
      'BootNotification',
      {
        chargePointVendor: 'Delta',
        chargePointModel: 'City200',
        firmwareVersion: '3.0.0',
      },
    ]));

    const response = await responsePromise;

    // Phản hồi phải là Rejected
    assert.equal(response[0], 3);
    assert.equal(response[1], 'msg-ac2-01');
    assert.equal(response[2].status, 'Rejected');
    assert.equal(response[2].interval, 60);
    assert.match(response[2].currentTime, /Z$/);

    // Trụ KHÔNG được coi là trực tuyến
    const saved = dbChargePoints.get('CP-LOCKED-01');
    assert.equal(saved.status, 'UNKNOWN', 'Trụ trạm bị khoá KHÔNG được chuyển sang ONLINE');

    // Sau khi bị Rejected, trụ vẫn chưa được accepted, gửi tin khác sẽ bị SecurityError
    const heartbeatPromise = receiveFrame(client);
    client.send(JSON.stringify([2, 'msg-ac2-02', 'Heartbeat', {}]));
    const hbResponse = await heartbeatPromise;
    assert.equal(hbResponse[0], 4);
    assert.equal(hbResponse[2], 'SecurityError');

    await closeClient(client);
  });

  it('AC3: Trụ gửi BootNotification lần thứ hai trong cùng kết nối -> cập nhật thông tin, KHÔNG tạo bản ghi trụ mới', async () => {
    dbChargePoints.set('CP-REBOOT-01', {
      id: 104,
      code: 'CP-REBOOT-01',
      station_id: 1,
      vendor: null,
      model: null,
      firmware_version: null,
      status: 'UNKNOWN',
    });

    const client = await connectClient('CP-REBOOT-01');

    // Boot lần 1
    const p1 = receiveFrame(client);
    client.send(JSON.stringify([
      2,
      'boot-1',
      'BootNotification',
      { chargePointVendor: 'VendorInitial', chargePointModel: 'ModelInitial', firmwareVersion: '1.0' },
    ]));
    const res1 = await p1;
    assert.equal(res1[2].status, 'Accepted');

    const totalBefore = dbChargePoints.size;

    // Boot lần 2 (cùng kết nối, ví dụ firmware đã được update OTA)
    const p2 = receiveFrame(client);
    client.send(JSON.stringify([
      2,
      'boot-2',
      'BootNotification',
      { chargePointVendor: 'VendorInitial', chargePointModel: 'ModelInitial', firmwareVersion: '2.0-OTA' },
    ]));
    const res2 = await p2;
    assert.equal(res2[2].status, 'Accepted');

    const totalAfter = dbChargePoints.size;
    assert.equal(totalAfter, totalBefore, 'Không được tạo thêm bản ghi mới trong DB');

    const updated = dbChargePoints.get('CP-REBOOT-01');
    assert.equal(updated.firmware_version, '2.0-OTA', 'Phải cập nhật thông tin mới nhất');
    assert.equal(updated.status, 'ONLINE');

    await closeClient(client);
  });

  it('AC4: Trụ gửi tin nhắn khác trước khi được chấp nhận -> trả về CALLERROR SecurityError', async () => {
    dbChargePoints.set('CP-SEC-01', {
      id: 105,
      code: 'CP-SEC-01',
      station_id: 1,
      vendor: null,
      model: null,
      firmware_version: null,
      status: 'UNKNOWN',
    });

    const client = await connectClient('CP-SEC-01');

    // Gửi Heartbeat trước khi BootNotification
    const errorPromise = receiveFrame(client);
    client.send(JSON.stringify([2, 'msg-hb-before-boot', 'Heartbeat', {}]));
    const errorResponse = await errorPromise;

    // AC4: Phải trả về CALLERROR mã SecurityError
    assert.equal(errorResponse[0], 4);
    assert.equal(errorResponse[1], 'msg-hb-before-boot');
    assert.equal(errorResponse[2], 'SecurityError');
    assert.match(errorResponse[3], /not accepted/i);

    // Kết nối vẫn mở, bây giờ gửi BootNotification hợp lệ
    const bootPromise = receiveFrame(client);
    client.send(JSON.stringify([
      2,
      'msg-boot-after-err',
      'BootNotification',
      { chargePointVendor: 'SecVendor', chargePointModel: 'SecModel' },
    ]));
    const bootResponse = await bootPromise;
    assert.equal(bootResponse[0], 3);
    assert.equal(bootResponse[2].status, 'Accepted');

    // Sau khi đã được chấp nhận, gửi Heartbeat thành công
    const validHbPromise = receiveFrame(client);
    client.send(JSON.stringify([2, 'msg-hb-after-boot', 'Heartbeat', {}]));
    const validHbResponse = await validHbPromise;
    assert.equal(validHbResponse[0], 3);
    assert.ok(validHbResponse[2].currentTime);

    await closeClient(client);
  });

  it('T-17 hoàn thành: Đổi cấu hình interval và khởi động lại ứng dụng -> giá trị mới được sử dụng', async () => {
    // Tạo handler với interval tuỳ chỉnh = 300 (giả lập cấu hình mới sau khởi động lại)
    const customBootHandler = createBootNotificationHandler({
      pool: mockPool,
      getHeartbeatInterval: () => 300,
    });

    const customMessages = createOcppMessageHandler({
      handlers: { BootNotification: customBootHandler },
    });

    const customServer = http.createServer();
    const customWss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => protocols.has('ocpp1.6') ? 'ocpp1.6' : false,
    });

    customWss.on('connection', (ws, code) => {
      ws.chargePointCode = code;
      ws.on('message', (raw) => { void customMessages.handleMessage(ws, raw); });
    });

    customServer.on('upgrade', createOcppUpgradeHandler({
      wss: customWss,
      lookupChargePoint: async (code) => ({ id: 999, code, station_status: 'ACTIVE' }),
    }));

    customServer.listen(0, '127.0.0.1');
    await once(customServer, 'listening');
    const customUrl = `ws://127.0.0.1:${customServer.address().port}`;

    const client = new WebSocket(`${customUrl}/ocpp/CP-CUSTOM-INTERVAL`, ['ocpp1.6']);
    await once(client, 'open');

    const resPromise = new Promise((resolve) => client.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
    client.send(JSON.stringify([2, 'msg-cfg-test', 'BootNotification', { chargePointVendor: 'V', chargePointModel: 'M' }]));
    const res = await resPromise;

    assert.equal(res[0], 3);
    assert.equal(res[2].status, 'Accepted');
    assert.equal(res[2].interval, 300, 'Khoảng nhịp tim mới từ cấu hình (300s) phải được trả về');

    client.close();
    await once(client, 'close');
    await new Promise((resolve) => customWss.close(resolve));
    await new Promise((resolve) => customServer.close(resolve));
  });
});
