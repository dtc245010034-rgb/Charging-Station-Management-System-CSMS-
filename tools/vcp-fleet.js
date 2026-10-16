#!/usr/bin/env node
// Bộ điều phối đội trụ sạc ảo (Virtual Charge Point - VCP) chạy trong Docker Compose (T-55 / S-26)
// Tự động seed trạm & trụ mang tiền tố VCP- qua API Quản trị (idempotent),
// kết nối WebSocket OCPP 1.6J, gửi BootNotification, duy trì nhịp tim Heartbeat,
// cập nhật StatusNotification và phản hồi đầy đủ các lệnh điều khiển từ xa (Reset, RemoteStop, RemoteStart).
'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { profileResult, resolveSetChargingProfile, profileLimitW, meterReading } = require('./lib/charging-profile');

const CONFIGURATION_RANGES = Object.freeze({
  HeartbeatInterval: { min: 10, max: 86400 },
  MeterValueSampleInterval: { min: 0, max: 3600 },
});

// Nạp .env nếu có (dành cho chạy trực tiếp ngoài Docker)
try {
  require('../backend/node_modules/dotenv').config({
    path: path.resolve(__dirname, '../.env'),
    quiet: true,
  });
} catch {
  try {
    require('dotenv').config({
      path: path.resolve(__dirname, '../.env'),
      quiet: true,
    });
  } catch {
    // Không có dotenv thì dùng biến môi trường hiện tại
  }
}

let WebSocket;
try {
  ({ WebSocket } = require('../backend/node_modules/ws'));
} catch {
  try {
    ({ WebSocket } = require('ws'));
  } catch {
    console.error('Lỗi: Chưa tìm thấy thư viện ws. Hãy chạy npm ci trong backend.');
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseOptions(argv = process.argv.slice(2), env = process.env) {
  const options = {
    url: env.CSMS_URL || 'http://localhost:3000',
    count: Math.max(1, parseInt(env.VCP_COUNT, 10) || 20),
    prefix: (env.VCP_PREFIX || 'VCP-').toUpperCase(),
    heartbeatInterval: Math.max(5, parseInt(env.VCP_HEARTBEAT_INTERVAL, 10) || 60),
    profileResult: profileResult(env.VCP_PROFILE_RESULT || 'Accepted'),
    rebootRequiredKey: env.VCP_REBOOT_REQUIRED_KEY || null,
    email: env.ADMIN_EMAIL || '',
    password: env.ADMIN_PASSWORD || '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const val = argv[i + 1];
    if (arg === '--url' && val) { options.url = val; i += 1; }
    else if (arg === '--count' && val) { options.count = Math.max(1, parseInt(val, 10) || 20); i += 1; }
    else if (arg === '--prefix' && val) { options.prefix = val.toUpperCase(); i += 1; }
    else if (arg === '--heartbeat' && val) { options.heartbeatInterval = Math.max(5, parseInt(val, 10) || 60); i += 1; }
    else if (arg === '--profile-result' && val) { options.profileResult = profileResult(val); i += 1; }
    else if (arg === '--reboot-required-key' && val) { options.rebootRequiredKey = val; i += 1; }
    else if (arg === '--email' && val) { options.email = val; i += 1; }
    else if (arg === '--password' && val) { options.password = val; i += 1; }
  }

  if (options.rebootRequiredKey && !Object.hasOwn(CONFIGURATION_RANGES, options.rebootRequiredKey)) {
    throw new Error(`Không hỗ trợ khóa cấu hình RebootRequired: ${options.rebootRequiredKey}`);
  }
  if (!options.email || !options.password) {
    throw new Error('Thiếu thông tin đăng nhập quản trị (ADMIN_EMAIL / ADMIN_PASSWORD)');
  }
  return options;
}

function createApi(baseUrl) {
  let cookie = null;

  async function request(method, route, body, headers = {}) {
    const url = new URL(route, baseUrl);
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Không phải JSON
    }

    return { ok: response.ok, status: response.status, data, headers: response.headers };
  }

  async function login(email, password) {
    const res = await request('POST', '/api/auth/login', { email, password });
    if (!res.ok) {
      throw new Error(`Đăng nhập API thất bại: HTTP ${res.status}`);
    }
    cookie = res.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) {
      throw new Error('Đăng nhập API không trả cookie xác thực');
    }
  }

  return { request, login };
}

async function waitForServer(baseUrl, maxWaitMs = 60000) {
  const start = Date.now();
  const healthUrl = new URL('/api/health', baseUrl);
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return true;
    } catch {
      // Server chưa phản hồi, đợi tiếp
    }
    await sleep(2000);
  }
  throw new Error(`Quá thời gian chờ máy chủ CSMS tại ${baseUrl} (${maxWaitMs}ms)`);
}

async function ensureFleetProvisioned(api, options) {
  const stationName = `${options.prefix}STATION-1`;
  const stationsRes = await api.request('GET', '/api/stations');
  if (!stationsRes.ok) throw new Error(`Lấy danh sách trạm thất bại: HTTP ${stationsRes.status}`);

  const existingStations = stationsRes.data || [];
  let station = existingStations.find((s) => s.name === stationName);

  if (!station) {
    const createStationRes = await api.request('POST', '/api/stations', {
      name: stationName,
      address: 'Trạm trụ ảo tự động (Docker Compose)',
      latitude: 21.03,
      longitude: 105.85,
    }, { 'Idempotency-Key': randomUUID() });

    if (!createStationRes.ok) {
      throw new Error(`Không tạo được trạm ${stationName}: HTTP ${createStationRes.status}`);
    }
    station = createStationRes.data;
  }

  if (station.status !== 'ACTIVE') {
    const updateRes = await api.request('PATCH', `/api/stations/${station.id}`, { status: 'ACTIVE' });
    if (updateRes.ok) station = updateRes.data;
  }

  const pointsRes = await api.request('GET', '/api/charge-points');
  if (!pointsRes.ok) throw new Error(`Lấy danh sách trụ thất bại: HTTP ${pointsRes.status}`);

  const existingPoints = pointsRes.data || [];
  const existingCodes = new Set(existingPoints.map((p) => p.code));

  const targetCodes = [];
  for (let i = 1; i <= options.count; i += 1) {
    const code = `${options.prefix}${String(i).padStart(3, '0')}`;
    targetCodes.push(code);

    if (!existingCodes.has(code)) {
      const createPointRes = await api.request('POST', `/api/stations/${station.id}/charge-points`, {
        code,
        connector_count: 1,
        vendor: 'CSMS-VCP',
        model: 'Virtual-2026',
      });
      if (!createPointRes.ok) {
        throw new Error(`Không tạo được trụ ${code}: HTTP ${createPointRes.status}`);
      }
    }
  }

  return { station, codes: targetCodes };
}

class ManagedChargePoint {
  constructor(code, wsBaseUrl, heartbeatInterval = 60, setChargingProfileResult = 'Accepted', { rebootRequiredKey = null } = {}) {
    this.code = code;
    this.wsBaseUrl = wsBaseUrl;
    this.heartbeatInterval = heartbeatInterval;
    this.configuration = {
      HeartbeatInterval: String(heartbeatInterval),
      MeterValueSampleInterval: '10',
    };
    this.rebootRequiredKey = rebootRequiredKey;
    this.socket = null;
    this.heartbeatTimer = null;
    this.meterValuesTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.sequence = 0;
    this.stopping = false;

    // Trạng thái phiên sạc nội tại của trụ
    this.currentTransactionId = null;
    this.currentConnectorId = null;
    this.currentChargingProfile = null;
    // Khắc phục LỖI 2: Thanh ghi năng lượng tích lũy đơn điệu tăng (Monotonically Increasing Accumulator)
    this.currentMeterWh = 10000;
    this.currentIdTag = 'TAG-DEMO-01';
    this.setChargingProfileResult = profileResult(setChargingProfileResult);
  }

  async connect() {
    if (this.stopping) return;
    const wsUrl = `${this.wsBaseUrl}/ocpp/${encodeURIComponent(this.code)}`;
    this.socket = new WebSocket(wsUrl, ['ocpp1.6']);

    this.socket.on('message', (raw) => this.handleMessage(raw));

    // Khắc phục LỖI 2 (Vòng 1): Bắt tay an toàn với timeout và dọn dẹp listener (không treo vĩnh viễn)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`${this.code}: Kết nối WebSocket quá hạn 10s`));
      }, 10000);

      const onOpen = () => { cleanup(); resolve(); };
      const onError = (err) => { cleanup(); reject(err); };
      const onClose = (code, reason) => {
        cleanup();
        reject(new Error(`${this.code}: Socket bị đóng trước khi mở (code ${code}: ${reason || 'unknown'})`));
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.socket.removeListener('open', onOpen);
        this.socket.removeListener('error', onError);
        this.socket.removeListener('close', onClose);
      };

      this.socket.once('open', onOpen);
      this.socket.once('error', onError);
      this.socket.once('close', onClose);
    });

    // Reset bộ đếm thử lại khi kết nối thành công
    this.reconnectAttempts = 0;

    this.socket.on('error', () => {});
    this.socket.on('close', () => {
      this.cleanup();
      if (!this.stopping) {
        this.scheduleReconnect();
      }
    });

    await this.bootAndInit();
  }

  // Khắc phục LỖI 6 (Vòng 2): Exponential Backoff với Sàn độ trễ tối thiểu (Floor Delay >= 1000ms)
  calculateBackoffDelay(attempts = this.reconnectAttempts) {
    const baseDelay = 2000;
    const maxDelay = 30000;
    const floorDelay = 1000; // Sàn tối thiểu 1.000ms theo kiến trúc AWS Backoff
    const exponential = Math.min(maxDelay, baseDelay * Math.pow(1.5, Math.min(attempts, 6)));
    const jitter = floorDelay + Math.random() * Math.max(0, exponential - floorDelay);
    return Math.round(jitter);
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    this.reconnectAttempts += 1;
    const delay = this.calculateBackoffDelay(this.reconnectAttempts);
    this.reconnectTimer = setTimeout(() => this.reconnect(), delay);
  }

  async bootAndInit() {
    try {
      const bootRes = await this.call('BootNotification', {
        chargePointVendor: 'CSMS-VCP',
        chargePointModel: 'Virtual-2026',
        chargePointSerialNumber: this.code,
      });

      if (bootRes && bootRes.status === 'Accepted') {
        const interval = bootRes.interval ? Math.max(5, Number(bootRes.interval)) : this.heartbeatInterval;
        this.startHeartbeat(interval);

        const connId = this.currentConnectorId || 1;
        await this.call('StatusNotification', {
          connectorId: connId,
          status: this.currentTransactionId ? 'Charging' : 'Available',
          errorCode: 'NoError',
          timestamp: new Date().toISOString(),
        });

        // Khắc phục DEF-01 (Vòng 3): Tái kích hoạt bộ đếm MeterValues nếu đang có phiên sạc dở dang khi kết nối lại
        if (this.currentTransactionId) {
          this.startMeterValuesReporting(connId, this.currentTransactionId);
        }
      }
    } catch {
      // Lỗi trong boot, socket sẽ tự đóng và thử lại
    }
  }

  startHeartbeat(intervalSeconds) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.call('Heartbeat', {}).catch(() => {});
      }
    }, intervalSeconds * 1000);
    this.heartbeatTimer.unref?.();
  }

  // Khắc phục LỖI 3 (Vòng 2) & DEF-02 (Vòng 3): Bổ sung Current.Import và SoC vào bản tin MeterValues định kỳ
  startMeterValuesReporting(connectorId, transactionId) {
    clearInterval(this.meterValuesTimer);
    const intervalSeconds = Number(this.configuration.MeterValueSampleInterval);
    if (intervalSeconds === 0) return;
    this.meterValuesTimer = setInterval(async () => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN && this.currentTransactionId === transactionId) {
        const limitW = profileLimitW(this.currentChargingProfile, connectorId, transactionId);
        const reading = meterReading(this.currentMeterWh, limitW);
        this.currentMeterWh = reading.meterWh;
        this.currentSoC = Math.min(100, (this.currentSoC || 20) + 1); // Tăng tiến mức pin %
        await this.call('MeterValues', {
          connectorId,
          transactionId,
          meterValue: [{
            timestamp: new Date().toISOString(),
            sampledValue: [
              {
                value: String(this.currentMeterWh),
                context: 'Sample.Periodic',
                measurand: 'Energy.Active.Import.Register',
                unit: 'Wh',
              },
              {
                value: String(reading.powerW),
                context: 'Sample.Periodic',
                measurand: 'Power.Active.Import',
                unit: 'W',
              },
              {
                value: '32.0',
                context: 'Sample.Periodic',
                measurand: 'Current.Import',
                unit: 'A',
              },
              {
                value: String(this.currentSoC),
                context: 'Sample.Periodic',
                measurand: 'SoC',
                unit: 'Percent',
              },
            ],
          }],
        });
      }
    }, intervalSeconds * 1000);
    this.meterValuesTimer.unref?.();
  }

  async call(action, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return null;
    const messageId = `vcp-${++this.sequence}-${randomUUID()}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 10000);
      const onResponse = (raw) => {
        try {
          const frame = JSON.parse(raw.toString());
          if (frame[1] === messageId) {
            clearTimeout(timer);
            this.socket.removeListener('message', onResponse);
            if (frame[0] === 3) resolve(frame[2]);
            else resolve(null);
          }
        } catch {
          // Bỏ qua lỗi parse
        }
      };
      this.socket.on('message', onResponse);
      this.socket.send(JSON.stringify([2, messageId, action, payload]), (err) => {
        if (err) {
          clearTimeout(timer);
          this.socket.removeListener('message', onResponse);
          resolve(null);
        }
      });
    });
  }

  // Xử lý lệnh điều khiển từ xa tuân thủ 100% chuẩn OCPP 1.6
  handleMessage(raw) {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (frame[0] === 2) {
      const [, messageId, action, payload = {}] = frame;

      if (action === 'SetChargingProfile') {
        const result = resolveSetChargingProfile(payload, this.setChargingProfileResult);
        if (result.status === 'Accepted') this.currentChargingProfile = result.profile;
        this.socket.send(JSON.stringify([3, messageId, { status: result.status }]));
      } else if (action === 'ChangeConfiguration') {
        const { key, value } = payload;
        const range = CONFIGURATION_RANGES[key];
        let status = 'NotSupported';
        if (range) {
          const parsedValue = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
          status = Number.isInteger(parsedValue) && parsedValue >= range.min && parsedValue <= range.max
            ? (key === this.rebootRequiredKey ? 'RebootRequired' : 'Accepted')
            : 'Rejected';
          if (status === 'Accepted' || status === 'RebootRequired') {
            this.configuration[key] = value;
            if (status === 'Accepted' && key === 'HeartbeatInterval') {
              this.heartbeatInterval = parsedValue;
              if (this.heartbeatTimer) this.startHeartbeat(parsedValue);
            }
            if (status === 'Accepted' && key === 'MeterValueSampleInterval' && this.currentTransactionId) {
              this.startMeterValuesReporting(this.currentConnectorId, this.currentTransactionId);
            }
          }
        }
        this.socket.send(JSON.stringify([3, messageId, { status }]));
      } else if (action === 'GetConfiguration') {
        const keys = Array.isArray(payload.key) ? payload.key : Object.keys(this.configuration);
        const configurationKey = [];
        const unknownKey = [];
        for (const key of keys) {
          if (Object.hasOwn(this.configuration, key)) {
            configurationKey.push({ key, value: this.configuration[key], readonly: false });
          } else {
            unknownKey.push(key);
          }
        }
        this.socket.send(JSON.stringify([3, messageId, { configurationKey, unknownKey }]));
      } else if (action === 'Reset') {
        this.socket.send(JSON.stringify([3, messageId, { status: 'Accepted' }]));
        setTimeout(() => this.reconnect(), 1000);
      } else if (action === 'RemoteStartTransaction') {
        const { idTag, connectorId = 1 } = payload;
        this.currentConnectorId = connectorId;
        this.currentIdTag = idTag || 'TAG-DEMO-01';
        this.currentSoC = 20;

        this.socket.send(JSON.stringify([3, messageId, { status: 'Accepted' }]));
        setTimeout(async () => {
          try {
            await this.call('StatusNotification', {
              connectorId: this.currentConnectorId,
              status: 'Preparing',
              errorCode: 'NoError',
              timestamp: new Date().toISOString(),
            });
            // Khắc phục LỖI 2: Dùng chỉ số tích lũy hiện tại (không reset về 10.000 Wh)
            const meterStart = this.currentMeterWh;
            const startRes = await this.call('StartTransaction', {
              connectorId: this.currentConnectorId,
              idTag: this.currentIdTag,
              meterStart,
              timestamp: new Date().toISOString(),
            });
            if (startRes && Number.isSafeInteger(startRes.transactionId)) {
              this.currentTransactionId = startRes.transactionId;
              await this.call('StatusNotification', {
                connectorId: this.currentConnectorId,
                status: 'Charging',
                errorCode: 'NoError',
                timestamp: new Date().toISOString(),
              });
              // Khắc phục LỖI 3: Kích hoạt báo cáo MeterValues định kỳ
              this.startMeterValuesReporting(this.currentConnectorId, this.currentTransactionId);
            }
          } catch {}
        }, 100);
      } else if (action === 'RemoteStopTransaction') {
        const { transactionId } = payload;
        // Khắc phục LỖI 4: Kiểm tra trạng thái phiên, nếu không có phiên hoặc sai txId thì từ chối Rejected theo OCPP 1.6 Mục 4.7
        if (!this.currentTransactionId || (transactionId && Number(transactionId) !== Number(this.currentTransactionId))) {
          this.socket.send(JSON.stringify([3, messageId, { status: 'Rejected' }]));
          return;
        }

        const txIdToStop = this.currentTransactionId;
        // Khắc phục LỖI 5: Dùng đúng đầu nối hiện tại của phiên sạc (không gán cứng connectorId 1)
        const connIdToStop = this.currentConnectorId || 1;

        this.socket.send(JSON.stringify([3, messageId, { status: 'Accepted' }]));
        clearInterval(this.meterValuesTimer);

        setTimeout(async () => {
          try {
            this.currentMeterWh += 2500; // Tăng tiến chỉ số đo cuối phiên
            await this.call('StopTransaction', {
              transactionId: txIdToStop,
              meterStop: this.currentMeterWh,
              timestamp: new Date().toISOString(),
              reason: 'Remote',
            });
            this.currentTransactionId = null;
            if (this.currentChargingProfile?.csChargingProfiles.transactionId === txIdToStop) {
              this.currentChargingProfile = null;
            }

            await this.call('StatusNotification', {
              connectorId: connIdToStop,
              status: 'Finishing',
              errorCode: 'NoError',
              timestamp: new Date().toISOString(),
            });
            await this.call('StatusNotification', {
              connectorId: connIdToStop,
              status: 'Available',
              errorCode: 'NoError',
              timestamp: new Date().toISOString(),
            });
            this.currentConnectorId = null;
          } catch {}
        }, 100);
      } else {
        // Lệnh chưa hỗ trợ trả về NotImplemented đúng chuẩn OCPP 1.6
        this.socket.send(JSON.stringify([4, messageId, 'NotImplemented', `Hành động ${action} chưa được hỗ trợ trên trụ ảo`, {}]));
      }
    }
  }

  async reconnect() {
    this.cleanup();
    if (this.stopping) return;
    try {
      await this.connect();
    } catch {
      this.scheduleReconnect();
    }
  }

  cleanup() {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    clearInterval(this.meterValuesTimer);
    this.meterValuesTimer = null;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      try { this.socket.terminate(); } catch {}
      this.socket = null;
    }
  }

  async shutdown() {
    this.stopping = true;
    this.cleanup();
  }
}

async function runFleet() {
  const options = parseOptions();
  console.log(`[VCP] Khởi động đội trụ ảo: ${options.count} trụ, tiền tố ${options.prefix}, đích: ${options.url}`);

  await waitForServer(options.url);
  console.log(`[VCP] Máy chủ CSMS sẵn sàng. Đang đăng nhập...`);

  const api = createApi(options.url);

  // Khắc phục LỖI 1 (Vòng 2): Bọc đăng nhập với retry có giới hạn (max 3 lần, cách nhau 5s) để chống khóa IP HTTP 429
  let loginSuccess = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await api.login(options.email, options.password);
      loginSuccess = true;
      break;
    } catch (err) {
      if (attempt === 3) {
        console.error(`[VCP] Đăng nhập thất bại sau 3 lần thử (${err.message}). Dừng tiến trình sạch sẽ để tránh kích hoạt IP lock.`);
        process.exit(1);
      }
      console.warn(`[VCP] Đăng nhập thử lần ${attempt} thất bại (${err.message}). Thử lại sau 5s...`);
      await sleep(5000);
    }
  }

  console.log(`[VCP] Đăng nhập thành công. Đang đồng bộ danh mục trạm & trụ...`);

  const { codes } = await ensureFleetProvisioned(api, options);
  console.log(`[VCP] Đã kiểm tra/tạo ${codes.length} trụ sạc thành công.`);

  const wsBaseUrl = options.url.replace(/^http/i, 'ws').replace(/\/+$/, '');
  const fleet = codes.map((code) => new ManagedChargePoint(
    code,
    wsBaseUrl,
    options.heartbeatInterval,
    options.profileResult,
    { rebootRequiredKey: options.rebootRequiredKey }
  ));

  console.log(`[VCP] Đang thiết lập kết nối OCPP 1.6J cho ${fleet.length} trụ...`);
  // Pacing 150ms để không vi phạm rate-limit bắt tay
  for (const point of fleet) {
    point.connect().catch(() => {});
    await sleep(150);
  }

  console.log(`[VCP] Toàn bộ ${fleet.length} trụ ảo đã trực tuyến và gửi Heartbeat định kỳ.`);

  const stopHandler = async () => {
    console.log('\n[VCP] Đang dừng đội trụ ảo sạch sẽ...');
    await Promise.all(fleet.map((p) => p.shutdown()));
    console.log('[VCP] Đã tắt toàn bộ trụ ảo. Kết thúc.');
    process.exit(0);
  };

  process.on('SIGINT', stopHandler);
  process.on('SIGTERM', stopHandler);
}

if (require.main === module) {
  runFleet().catch((err) => {
    console.error('[VCP] Lỗi nghiêm trọng:', err.message);
    process.exit(1);
  });
}

module.exports = { parseOptions, createApi, ensureFleetProvisioned, ManagedChargePoint };
