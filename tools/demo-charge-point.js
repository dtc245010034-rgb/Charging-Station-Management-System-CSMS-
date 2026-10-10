#!/usr/bin/env node
// Trụ sạc ảo TƯƠNG TÁC (OCPP 1.6J) để demo Sprint 2 (S-06 → S-16) trên máy chủ CSMS đang chạy.
// Giữ kết nối, tự gửi Heartbeat, trả lời lệnh Reset/RemoteStop của máy chủ, và nhận lệnh gõ tay.
// Chỉ gửi/nhận khung JSON thô qua `ws`, không dùng thư viện OCPP, nên gửi được cả khung hỏng để thử S-07.
// Hướng dẫn từng bước: docs/DEMO_SPRINT2.md
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { parseArgs } = require('node:util');
const { randomUUID } = require('node:crypto');

let WebSocket;
try {
  ({ WebSocket } = require('../backend/node_modules/ws'));
} catch {
  try {
    ({ WebSocket } = require('ws'));
  } catch {
    console.error('Chưa có thư viện ws. Chạy: cd backend && npm ci');
    process.exit(1);
  }
}

const USAGE = `Dùng: node tools/demo-charge-point.js [MÃ_TRỤ] [tuỳ chọn]
      node tools/demo-charge-point.js probe [MÃ_TRỤ]      (thử bắt tay S-06 rồi thoát)

  MÃ_TRỤ               mặc định DEMO-ST05-CP1 (trụ phải đã đăng ký trong hệ thống)
  --url <địa chỉ>      máy chủ CSMS (hoặc biến CSMS_URL; http/https tự đổi sang ws/wss).
                       Bỏ trống thì lấy cổng APP_PORT trong file .env ở thư mục gốc (run.py tự đổi cổng khi 3000 bận), không có thì 3000
  --connectors <n>     số đầu nối của trụ ảo, mặc định 2
  --heartbeat <giây>   ép chu kỳ Heartbeat; bỏ trống thì theo "interval" máy chủ trả trong Boot
  --reset <chế độ>     cách trả lời lệnh Reset: accept (mặc định, trả Accepted rồi tự khởi động lại),
                       accept-only, reject, silent (không trả lời, để thử hết thời gian), error
  --remote-stop <mode> cách trả lời RemoteStopTransaction: accept (gửi StopTransaction Remote), reject, silent, error
  --protocol <tên>     subprotocol WebSocket, mặc định ocpp1.6 ("none" = không gửi, để thử S-06)
  --skew-hours <giờ>   làm đồng hồ trụ lệch so với máy chủ (thử S-09)
  --no-boot            kết nối xong KHÔNG gửi Boot (thử SecurityError của S-08)
  --no-status          sau Boot không tự báo đầu nối Available`;

// run.py chọn cổng trống và ghi vào .env (APP_PORT), nên không thể mặc định cứng 3000.
function defaultBase() {
  try {
    const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const port = /^APP_PORT=(\d+)\s*$/m.exec(env)?.[1];
    if (port) return `ws://localhost:${port}`;
  } catch { /* không có .env: dùng cổng mặc định */ }
  return 'ws://localhost:3000';
}

const REFUSED_HINT = 'Không có máy chủ nào nghe ở địa chỉ này. Hãy chạy `python run.py` (hoặc `python run.py status` để xem cổng), '
  + 'rồi chỉ đúng cổng bằng --url ws://localhost:<cổng> nếu cần.';

const RESET_MODES = ['accept', 'accept-only', 'reject', 'silent', 'error'];
const OCPP_STATUSES = ['Available', 'Preparing', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Finishing', 'Reserved', 'Unavailable', 'Faulted'];
const BAD_FRAMES = {
  'not-json': { text: 'day-khong-phai-json', expect: 'FormationViolation' },
  'not-array': { text: '{"hello":"world"}', expect: 'FormationViolation' },
  'bad-type': { text: '[9,"bad-type-1","Heartbeat",{}]', expect: 'ProtocolError' },
  'too-short': { text: '[2,"too-short-1","Heartbeat"]', expect: 'FormationViolation' },
  'bad-payload': { text: '[2,"bad-payload-1","Heartbeat","khong-phai-doi-tuong"]', expect: 'FormationViolation' },
  'unknown-action': { text: '[2,"unknown-1","FooBar",{}]', expect: 'NotImplemented' },
};
const AUTH_CASES = [
  ['TAG-DEMO-01', ['Accepted', 'Blocked'], 'thẻ hợp lệ: Accepted ở trạm ACTIVE, Blocked ở trạm bảo trì/ngừng hoạt động'],
  ['TAG-BLOCKED-01', ['Blocked'], 'thẻ bị khoá'],
  ['TAG-EXPIRED-01', ['Expired'], 'thẻ quá hạn'],
  ['TAG-KHONG-TON-TAI', ['Invalid'], 'thẻ không có trong hệ thống'],
  ['TAG-DAI-HON-20-KY-TU-X', ['FormationViolation'], 'thẻ dài hơn 20 ký tự (CALLERROR)'],
];
const PLAY_STEPS = [
  [1, 'Preparing'], [1, 'Charging'], [1, 'SuspendedEV'], [1, 'Faulted', 'OverCurrentFailure'], [1, 'Available'],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const colorOn = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) => (colorOn ? `\x1b[${code}m${text}\x1b[0m` : String(text));
const c = { dim: paint(2), red: paint(31), green: paint(32), yellow: paint(33), cyan: paint(36), bold: paint(1) };

function endpointOf(base, code) {
  let url = base.trim().replace(/^http/i, 'ws').replace(/\/ocpp\/[^/]*\/?$/, '').replace(/\/+$/, '');
  if (!/^wss?:\/\//i.test(url)) url = `ws://${url}`;
  return `${url}/ocpp/${encodeURIComponent(code)}`;
}

function readOptions() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        url: { type: 'string' }, connectors: { type: 'string' }, heartbeat: { type: 'string' }, reset: { type: 'string' }, 'remote-stop': { type: 'string' },
        protocol: { type: 'string' }, 'skew-hours': { type: 'string' },
        'no-boot': { type: 'boolean' }, 'no-status': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exit(2);
  }
  const { values, positionals } = parsed;
  if (values.help) { console.log(USAGE); process.exit(0); }
  const probe = positionals[0] === 'probe';
  const code = (probe ? positionals[1] : positionals[0]) || 'DEMO-ST05-CP1';
  const number = (value, fallback) => (value === undefined ? fallback : Number(value));
  const opts = {
    probe,
    code,
    base: values.url || process.env.CSMS_URL || defaultBase(),
    connectors: number(values.connectors, 2),
    heartbeat: number(values.heartbeat, null),
    reset: values.reset || 'accept',
    remoteStop: values['remote-stop'] || 'accept',
    protocol: values.protocol === undefined ? 'ocpp1.6' : (values.protocol === 'none' ? '' : values.protocol),
    skewHours: number(values['skew-hours'], 0),
    boot: !values['no-boot'],
    status: !values['no-status'],
  };
  if (!Number.isInteger(opts.connectors) || opts.connectors < 0) { console.error('--connectors phải là số nguyên ≥ 0'); process.exit(2); }
  if (opts.heartbeat !== null && !(opts.heartbeat > 0)) { console.error('--heartbeat phải là số giây > 0'); process.exit(2); }
  if (!RESET_MODES.includes(opts.reset)) { console.error(`--reset phải là một trong: ${RESET_MODES.join(', ')}`); process.exit(2); }
  if (!['accept', 'reject', 'silent', 'error'].includes(opts.remoteStop)) { console.error('--remote-stop phải là một trong: accept, reject, silent, error'); process.exit(2); }
  if (!Number.isFinite(opts.skewHours)) { console.error('--skew-hours phải là số'); process.exit(2); }
  return opts;
}

// ------------------------------------------------------------------ thử bắt tay (S-06)
function handshake(url, protocols) {
  return new Promise((resolve) => {
    const sock = protocols === null ? new WebSocket(url) : new WebSocket(url, protocols);
    let settled = false;
    const done = (result) => { if (!settled) { settled = true; resolve(result); } };
    sock.on('open', () => { done({ status: 101 }); sock.close(1000); });
    sock.on('unexpected-response', (req, res) => { done({ status: res.statusCode }); res.resume(); });
    sock.on('error', (error) => done({ status: null, error: error.message }));
    setTimeout(() => { done({ status: null, error: 'quá 5 giây không phản hồi' }); sock.terminate(); }, 5000).unref();
  });
}

async function probe(opts) {
  const { code } = opts;
  const cases = [
    ['Mã đã đăng ký + ocpp1.6', endpointOf(opts.base, code), ['ocpp1.6'], 101],
    ['Mã chưa đăng ký + ocpp1.6', endpointOf(opts.base, 'ZZ-KHONG-TON-TAI'), ['ocpp1.6'], 403],
    ['Mã đã đăng ký + ocpp1.5 (sai subprotocol)', endpointOf(opts.base, code), ['ocpp1.5'], 400],
    ['Mã đã đăng ký + không có subprotocol', endpointOf(opts.base, code), null, 400],
    ['Mã sai định dạng (có khoảng trắng và !)', endpointOf(opts.base, 'ma tru sai!'), ['ocpp1.6'], 400],
  ];
  console.log(`Thử bắt tay S-06 tới ${opts.base} (mã trụ: ${code})\n`);
  let failed = 0;
  let refused = 0;
  for (const [label, url, protocols, expected] of cases) {
    const result = await handshake(url, protocols);
    const pass = result.status === expected;
    if (!pass) failed += 1;
    if (/ECONNREFUSED/.test(result.error || '')) refused += 1;
    const actual = result.status ?? `lỗi: ${result.error}`;
    console.log(`${pass ? c.green('ĐẠT ') : c.red('LỆCH')}  ${label.padEnd(44)} mong đợi ${expected}, nhận ${actual}`);
  }
  if (refused === cases.length) console.log(c.yellow(`\n${REFUSED_HINT}`));
  console.log(failed ? c.red(`\n${failed} ca lệch.`) : c.green('\nTất cả ca khớp. (101 = mở kết nối, 403 = mã lạ, 400 = sai giao thức/định dạng)'));
  process.exit(failed ? 1 : 0);
}

// ------------------------------------------------------------------ trụ ảo
function createChargePoint(opts) {
  const endpoint = endpointOf(opts.base, opts.code);
  const state = {
    ws: null, count: 0, booted: false, interval: 60, heartbeatTimer: null, heartbeatSeconds: null, silent: false,
    resetMode: opts.reset, remoteStopMode: opts.remoteStop, sessions: new Map(), skewMs: opts.skewHours * 3600 * 1000, autoBoot: opts.boot, waiter: null,
  };
  const pending = new Map();
  let rl = null;
  let busy = false;

  const clock = () => new Date().toTimeString().slice(0, 8);
  const trueTime = () => new Date(Date.now() + state.skewMs).toISOString();

  function say(text = '') {
    const tty = rl && process.stdout.isTTY;
    if (tty) { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); }
    process.stdout.write(`${c.dim(clock())} ${text}\n`);
    if (tty && !busy) rl.prompt(true);
  }

  // ---------------------------------------------------------------- gửi / nhận khung
  function call(action, payload = {}, { id = randomUUID(), timeoutMs = 10000, show = 'raw', sock = state.ws } = {}) {
    return new Promise((resolve) => {
      if (!sock || sock.readyState !== WebSocket.OPEN) {
        say(c.red('Chưa có kết nối. Gõ `connect` để kết nối lại.'));
        resolve({ ok: false, code: 'NotConnected' });
        return;
      }
      const timer = setTimeout(() => {
        pending.delete(id);
        say(c.red(`Quá ${timeoutMs / 1000}s không có phản hồi cho ${action}`));
        resolve({ ok: false, code: 'Timeout' });
      }, timeoutMs);
      pending.set(id, { resolve, timer, sock, show });
      const frame = JSON.stringify([2, id, action, payload]);
      if (show === 'raw') say(`${c.cyan('→')} ${frame}`);
      sock.send(frame);
    });
  }

  function reply(sock, frame) {
    const text = JSON.stringify(frame);
    say(`${c.cyan('→')} ${text}`);
    sock.send(text);
  }

  function nextUnmatchedFrame(timeoutMs = 3000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { state.waiter = null; resolve(null); }, timeoutMs);
      state.waiter = (frame) => { clearTimeout(timer); state.waiter = null; resolve(frame); };
    });
  }

  function onServerCall(sock, id, action, payload) {
    say(`${c.yellow('⇦ Máy chủ gửi lệnh')} ${action} ${JSON.stringify(payload)}`);
    if (action === 'RemoteStopTransaction') {
      const active = [...state.sessions.entries()].find(([, session]) => session.transactionId === payload?.transactionId);
      if (!active) { reply(sock, [3, id, { status: 'Rejected' }]); return; }
      if (state.remoteStopMode === 'silent') { say(c.yellow('Chế độ silent: cố ý không trả lời RemoteStopTransaction.')); return; }
      if (state.remoteStopMode === 'reject') { reply(sock, [3, id, { status: 'Rejected' }]); return; }
      if (state.remoteStopMode === 'error') { reply(sock, [4, id, 'NotSupported', 'Demo: không hỗ trợ RemoteStopTransaction', {}]); return; }
      reply(sock, [3, id, { status: 'Accepted' }]);
      const [connectorId, session] = active;
      state.sessions.delete(connectorId);
      void call('StopTransaction', {
        transactionId: session.transactionId,
        meterStop: session.meterStart,
        timestamp: trueTime(),
        reason: 'Remote',
      }, { show: 'raw', sock });
      return;
    }
    if (action !== 'Reset') {
      reply(sock, [4, id, 'NotImplemented', `Trụ ảo chưa hỗ trợ ${action}`, {}]);
      return;
    }
    switch (state.resetMode) {
      case 'silent':
        say(c.yellow('Chế độ silent: cố ý KHÔNG trả lời để máy chủ báo hết thời gian chờ.'));
        break;
      case 'reject': reply(sock, [3, id, { status: 'Rejected' }]); break;
      case 'error': reply(sock, [4, id, 'NotSupported', 'Demo: trụ không hỗ trợ Reset', {}]); break;
      case 'accept-only': reply(sock, [3, id, { status: 'Accepted' }]); break;
      default:
        reply(sock, [3, id, { status: 'Accepted' }]);
        setTimeout(() => { void reboot(); }, 1000);
    }
  }

  function onFrame(sock, raw) {
    let frame;
    try { frame = JSON.parse(raw); } catch { say(`${c.red('←')} (không phải JSON) ${raw}`); return; }
    const [type, id] = Array.isArray(frame) ? frame : [];
    if (type === 2) { onServerCall(sock, id, frame[2], frame[3]); return; }
    const entry = pending.get(id);
    if (!entry || (type !== 3 && type !== 4)) {
      if (state.waiter) { state.waiter({ raw, frame }); return; }
      say(`${c.yellow('←')} khung không khớp lời gọi nào: ${raw}`);
      return;
    }
    pending.delete(id);
    clearTimeout(entry.timer);
    if (type === 3) {
      if (entry.show === 'raw') say(`${c.green('←')} ${raw}`);
      entry.resolve({ ok: true, payload: frame[2] });
    } else {
      say(`${c.red('←')} ${raw}`);
      entry.resolve({ ok: false, code: frame[2], description: frame[3], details: frame[4] });
    }
  }

  // ---------------------------------------------------------------- kết nối / Boot / Heartbeat
  function stopHeartbeat() {
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = null;
  }

  function startHeartbeat() {
    stopHeartbeat();
    state.heartbeatSeconds = opts.heartbeat ?? state.interval;
    state.silent = false;
    state.heartbeatTimer = setInterval(async () => {
      const result = await call('Heartbeat', {}, { show: 'none' });
      say(result.ok ? c.dim(`♥ Heartbeat OK, giờ máy chủ ${result.payload.currentTime}`) : c.red(`♥ Heartbeat lỗi: ${result.code}`));
    }, state.heartbeatSeconds * 1000);
  }

  async function announceAvailable() {
    for (let connectorId = 0; connectorId <= opts.connectors; connectorId += 1) {
      await call('StatusNotification', { connectorId, status: 'Available', errorCode: 'NoError', timestamp: trueTime() }, { show: 'none' });
    }
    say(c.dim(`Đã báo Available cho cả trụ (connectorId 0) và ${opts.connectors} đầu nối.`));
  }

  async function boot() {
    const result = await call('BootNotification', {
      chargePointVendor: 'CSMS-Demo', chargePointModel: 'Virtual-CP', chargePointSerialNumber: opts.code.slice(0, 25), firmwareVersion: '1.0.0-demo',
    });
    if (!result.ok) { say(c.red(`Boot lỗi: ${result.code}${result.description ? ` (${result.description})` : ''}`)); return false; }
    if (result.payload.status !== 'Accepted') {
      state.booted = false;
      stopHeartbeat();
      say(c.yellow(`Boot bị ${result.payload.status}: trạm có thể đang bị khoá. Mở khoá rồi gõ \`boot\` để thử lại.`));
      return false;
    }
    state.booted = true;
    state.interval = Number(result.payload.interval) || 60;
    startHeartbeat();
    say(c.green(`Boot Accepted. Nhịp tim ${state.heartbeatSeconds}s, giờ máy chủ ${result.payload.currentTime}`));
    if (opts.status) await announceAvailable();
    return true;
  }

  function connect({ second = false, boot: withBoot = state.autoBoot } = {}) {
    return new Promise((resolve) => {
      if (!second && state.ws && state.ws.readyState === WebSocket.OPEN) {
        say(c.yellow(`Đang có kết nối #${state.ws.n}. Gõ \`twin\` để mở thêm kết nối thứ hai cùng mã (S-13).`));
        resolve(false);
        return;
      }
      state.count += 1;
      const sock = opts.protocol ? new WebSocket(endpoint, opts.protocol) : new WebSocket(endpoint);
      sock.n = state.count;
      let rejected = false;
      say(`Mở kết nối #${sock.n} tới ${endpoint} (subprotocol: ${opts.protocol || 'không có'})…`);
      sock.on('open', async () => {
        state.ws = sock;
        say(c.green(`Đã kết nối #${sock.n}${sock.protocol ? `, subprotocol ${sock.protocol}` : ''}.`));
        if (withBoot) await boot();
        resolve(true);
      });
      sock.on('unexpected-response', (req, res) => {
        rejected = true;
        say(c.red(`Máy chủ từ chối bắt tay: HTTP ${res.statusCode} ${res.statusMessage || ''}`.trim()));
        res.resume();
        resolve(false);
      });
      sock.on('error', (error) => { if (!rejected) {
        say(c.red(`Lỗi kết nối #${sock.n}: ${error.message}`));
        if (/ECONNREFUSED/.test(error.message)) say(c.yellow(REFUSED_HINT));
        resolve(false);
      } });
      sock.on('message', (data) => onFrame(sock, data.toString()));
      sock.on('close', (code, reason) => {
        for (const [id, entry] of pending) {
          if (entry.sock !== sock) continue;
          clearTimeout(entry.timer);
          pending.delete(id);
          entry.resolve({ ok: false, code: 'Closed' });
        }
        if (rejected) return;
        const why = reason?.length ? ` "${reason.toString()}"` : '';
        say(c.yellow(`Kết nối #${sock.n} đã đóng (mã ${code}${why}).`));
        if (state.ws === sock) { state.ws = null; state.booted = false; stopHeartbeat(); }
        resolve(false);
      });
    });
  }

  async function reboot() {
    say(c.yellow('Trụ khởi động lại: ngắt kết nối, chờ 3 giây rồi kết nối + Boot lại…'));
    state.ws?.close(1000, 'Rebooting');
    await sleep(3000);
    await connect();
  }

  // ---------------------------------------------------------------- lệnh gõ tay
  const canonicalStatus = (text) => OCPP_STATUSES.find((name) => name.toLowerCase() === String(text).toLowerCase());

  async function sendStatus(connectorId, rawStatus, errorCode, vendorErrorCode) {
    const status = canonicalStatus(rawStatus) ?? rawStatus;
    if (!canonicalStatus(rawStatus)) say(c.yellow(`"${rawStatus}" không phải trạng thái OCPP 1.6: gửi nguyên văn (máy chủ sẽ ghi ERROR + cảnh báo gom).`));
    const payload = { connectorId, status, errorCode: errorCode ?? 'NoError', timestamp: trueTime() };
    if (vendorErrorCode) payload.vendorErrorCode = vendorErrorCode;
    return call('StatusNotification', payload);
  }

  async function authenticate(tag) {
    const result = await call('Authorize', { idTag: tag });
    say(result.ok ? c.bold(`Authorize ${tag} → ${result.payload.idTagInfo?.status}`) : c.bold(`Authorize ${tag} → CALLERROR ${result.code}`));
    return result;
  }

  const commands = {
    help: async () => say(HELP),
    info: async () => {
      const open = state.ws?.readyState === WebSocket.OPEN;
      say([
        `Trụ ${opts.code} @ ${endpoint}`,
        `Kết nối: ${open ? `đang mở (#${state.ws.n})` : 'không có'} | Boot: ${state.booted ? 'đã được chấp nhận' : 'chưa'}`,
        `Heartbeat: ${state.heartbeatTimer ? `mỗi ${state.heartbeatSeconds}s` : 'đang dừng'} | Reset: ${state.resetMode} | RemoteStop: ${state.remoteStopMode}`,
        `Đồng hồ trụ lệch máy chủ: ${state.skewMs / 3600000} giờ`,
      ].join('\n'));
    },
    connect: async (args) => { await connect({ boot: args[0] === 'noboot' ? false : state.autoBoot }); },
    twin: async () => { say(c.yellow('Mở kết nối thứ hai cùng mã; máy chủ phải đóng kết nối cũ (S-13).')); await connect({ second: true }); },
    boot: async () => { await boot(); },
    hb: async () => { await call('Heartbeat', {}); },
    status: async (args) => {
      const [id, status, errorCode, vendor] = args;
      if (id === undefined || status === undefined || !/^\d+$/.test(id)) { say(c.red('Dùng: status <connectorId> <trạng thái> [errorCode] [vendorErrorCode]   (connectorId 0 = cả trụ)')); return; }
      await sendStatus(Number(id), status, errorCode, vendor);
    },
    all: async (args) => {
      if (!args[0]) { say(c.red('Dùng: all <trạng thái> [errorCode]')); return; }
      for (let id = 1; id <= opts.connectors; id += 1) await sendStatus(id, args[0], args[1]);
    },
    play: async (args) => {
      const gap = Number(args[0]) || 3;
      say(`Phát kịch bản đầu nối 1, mỗi bước cách ${gap}s: Preparing → Charging → SuspendedEV → Faulted → Available`);
      for (const [index, [id, status, error]] of PLAY_STEPS.entries()) {
        await sendStatus(id, status, error);
        if (index < PLAY_STEPS.length - 1) await sleep(gap * 1000);
      }
    },
    auth: async (args) => {
      if (!args[0]) { say(c.red('Dùng: auth <idTag>')); return; }
      await authenticate(args[0]);
    },
    start: async (args) => {
      const connectorId = Number(args[0]);
      const idTag = args[1] || 'TAG-DEMO-01';
      const meterStart = args[2] === undefined ? 10000 : Number(args[2]);
      if (!Number.isInteger(connectorId) || connectorId < 1 || connectorId > opts.connectors || !Number.isSafeInteger(meterStart) || meterStart < 0) {
        say(c.red('Dùng: start <connectorId> [idTag=TAG-DEMO-01] [meterStartWh=10000]'));
        return;
      }
      const result = await call('StartTransaction', { connectorId, idTag, meterStart, timestamp: trueTime() });
      if (result.ok && result.payload.idTagInfo?.status === 'Accepted') {
        state.sessions.set(connectorId, { transactionId: result.payload.transactionId, meterStart });
        say(c.green(`Phiên bắt đầu: transactionId ${result.payload.transactionId} trên đầu nối ${connectorId}.`));
      } else if (result.ok) say(c.yellow(`StartTransaction không được chấp nhận: ${result.payload.idTagInfo?.status || 'phản hồi không rõ'}`));
    },
    'auth-all': async () => {
      const rows = [];
      for (const [tag, expected, note] of AUTH_CASES) {
        const result = await call('Authorize', { idTag: tag }, { show: 'none' });
        const actual = result.ok ? result.payload.idTagInfo?.status : result.code;
        rows.push(`${expected.includes(actual) ? c.green('ĐẠT') : c.yellow('LỆCH')}  ${tag.padEnd(24)} ${String(actual).padEnd(20)} (${note})`);
      }
      say(`Năm ca Authorize (thẻ seed demo):\n${rows.join('\n')}`);
    },
    dup: async (args) => {
      const [tag = 'TAG-DEMO-01', tag2] = args;
      const id = randomUUID();
      say(`Gửi Authorize hai lần với CÙNG messageId ${id}${tag2 ? ' nhưng nội dung khác' : ''}.`);
      const first = await call('Authorize', { idTag: tag }, { id });
      const second = await call('Authorize', { idTag: tag2 ?? tag }, { id });
      if (!first.ok || !second.ok) { say(c.red(`Không so sánh được: lần 1 ${first.ok ? 'OK' : first.code}, lần 2 ${second.ok ? 'OK' : second.code}.`)); return; }
      const same = JSON.stringify(first) === JSON.stringify(second);
      say(same
        ? c.green('Hai câu trả lời GIỐNG hệt: máy chủ phát lại câu đã lưu, không chạy handler lần hai (xem log app: "Duplicate CALL, replaying stored response").')
        : c.yellow('Hai câu trả lời KHÁC nhau: nội dung khác nên được xử lý như tin mới (quy tắc F8).'));
    },
    badframe: async (args) => {
      const names = !args[0] || args[0] === 'all' ? Object.keys(BAD_FRAMES) : [args[0]];
      if (names.some((name) => !BAD_FRAMES[name])) { say(c.red(`Khung hỏng có sẵn: ${Object.keys(BAD_FRAMES).join(', ')}, all`)); return; }
      const rows = [];
      for (const name of names) {
        const { text, expect } = BAD_FRAMES[name];
        say(`${c.cyan('→')} ${text}   ${c.dim(`(${name})`)}`);
        const waiting = nextUnmatchedFrame();
        state.ws?.send(text);
        const got = await waiting;
        const actual = got?.frame?.[2] ?? (got ? 'không phải CALLERROR' : 'không phản hồi');
        if (got) say(`${c.red('←')} ${got.raw}`);
        rows.push(`${actual === expect ? c.green('ĐẠT') : c.yellow('LỆCH')}  ${name.padEnd(15)} nhận ${actual} (mong đợi ${expect})`);
      }
      say(rows.join('\n'));
      const alive = await call('Heartbeat', {}, { show: 'none' });
      say(alive.ok ? c.green('Kết nối VẪN MỞ sau các khung hỏng: Heartbeat kế tiếp được trả lời bình thường.') : c.red(`Kết nối không còn dùng được (${alive.code}).`));
    },
    silence: async () => {
      stopHeartbeat();
      state.silent = true;
      const limit = (state.heartbeatSeconds ?? state.interval) * 2;
      say(c.yellow(`Ngừng Heartbeat nhưng GIỮ kết nối. Quá ${limit}s (2 × nhịp tim) trụ bị coi là quá hạn; job quét mỗi 60s nên đổi trạng thái trong ≤ ${limit + 60}s. Bấm "Làm mới" trên màn hình sau ${limit}s để thấy ngay.`));
    },
    resume: async () => { startHeartbeat(); await call('Heartbeat', {}); },
    drop: async () => { if (state.ws) state.ws.close(1000, 'Demo drop'); else say(c.yellow('Không có kết nối.')); },
    kill: async () => { if (state.ws) { say(c.yellow('Cắt đột ngột (không gửi khung đóng), như rút điện.')); state.ws.terminate(); } else say(c.yellow('Không có kết nối.')); },
    'reset-mode': async (args) => {
      if (!RESET_MODES.includes(args[0])) { say(c.red(`Dùng: reset-mode <${RESET_MODES.join('|')}>`)); return; }
      state.resetMode = args[0];
      say(`Từ giờ trả lời Reset theo chế độ: ${state.resetMode}`);
    },
    'remote-stop-mode': async (args) => {
      if (!['accept', 'reject', 'silent', 'error'].includes(args[0])) { say(c.red('Dùng: remote-stop-mode <accept|reject|silent|error>')); return; }
      state.remoteStopMode = args[0];
      say(`Từ giờ trả lời RemoteStopTransaction theo chế độ: ${state.remoteStopMode}`);
    },
    skew: async (args) => {
      const hours = Number(args[0]);
      if (!Number.isFinite(hours)) { say(c.red('Dùng: skew <số giờ lệch>, ví dụ skew 5')); return; }
      state.skewMs = hours * 3600 * 1000;
      say(`Đồng hồ trụ giờ lệch ${hours} giờ so với máy chủ: ${trueTime()} (giờ máy chủ phải vẫn là mốc "liên lạc cuối").`);
    },
    sleep: async (args) => { await sleep((Number(args[0]) || 1) * 1000); },
    quit: async () => { await shutdown(); },
  };
  commands.exit = commands.quit;

  async function execute(line) {
    const [name, ...args] = line.trim().split(/\s+/);
    if (!name) return;
    const run = commands[name.toLowerCase()];
    if (!run) { say(c.red(`Không có lệnh "${name}". Gõ help để xem danh sách.`)); return; }
    try { await run(args); } catch (error) { say(c.red(`Lỗi: ${error.message}`)); }
  }

  async function shutdown() {
    stopHeartbeat();
    if (state.ws && state.ws.readyState === WebSocket.OPEN) state.ws.close(1000, 'Bye');
    await sleep(200);
    process.exit(0);
  }

  async function start() {
    process.stdout.write(`${c.bold('Trụ sạc ảo CSMS')} ${opts.code} → ${endpoint}\nGõ ${c.bold('help')} để xem lệnh, Ctrl+D hoặc quit để thoát.\n\n`);
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: `${opts.code}> `, terminal: Boolean(process.stdin.isTTY) });
    const afterCommand = () => { busy = false; if (process.stdout.isTTY) rl.prompt(); };
    busy = true;
    let queue = connect().then(afterCommand);
    rl.on('line', (line) => {
      busy = true;
      queue = queue.then(() => execute(line)).then(afterCommand);
    });
    rl.on('SIGINT', () => { void shutdown(); });
    rl.on('close', () => { void queue.then(shutdown); });
  }

  return { start };
}

const HELP = `Lệnh (gõ trong dấu nhắc):
  Kết nối    connect [noboot] · twin (mở kết nối thứ hai cùng mã, S-13) · drop (đóng êm) · kill (cắt đột ngột) · info · quit
  Boot       boot (S-08; trạm bị khoá → Rejected)
  Nhịp tim   hb (gửi một Heartbeat, S-09) · silence (ngừng Heartbeat, giữ kết nối, S-12) · resume · skew <giờ> (lệch đồng hồ trụ)
  Đầu nối    status <connectorId> <trạng thái> [errorCode] [vendorErrorCode]   (S-10; connectorId 0 = cả trụ)
             all <trạng thái> [errorCode] · play [giây] (kịch bản Preparing→Charging→Faulted→Available)
             trạng thái: ${OCPP_STATUSES.join(', ')}
  Thẻ        auth <idTag> · auth-all (năm ca, S-15) · dup [thẻ] [thẻ-khác] (gửi trùng messageId, S-14)
  Khung hỏng badframe [${Object.keys(BAD_FRAMES).join('|')}|all]   (S-07)
  Phiên      start <connectorId> [idTag] [meterStartWh]   mở phiên OCPP để thử RemoteStopTransaction
  Reset      reset-mode <${RESET_MODES.join('|')}>   cách trả lời lệnh Reset của máy chủ (S-16)
  Dừng từ xa remote-stop-mode <accept|reject|silent|error>   cách trả lời lệnh RemoteStopTransaction (S-23)
  Khác       sleep <giây> · help`;

const options = readOptions();
if (options.probe) void probe(options);
else void createChargePoint(options).start();
