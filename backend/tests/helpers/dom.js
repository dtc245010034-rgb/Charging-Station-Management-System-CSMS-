const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const frontend = (file) => import(pathToFileURL(path.resolve(__dirname, '../../../frontend', file)).href);

// Dựng DOM thật (jsdom) và gắn các global mà mã giao diện dùng (document, Node, location, fetch...).
// respond(url, options) trả { status, body } giả lập backend. Gọi restore() sau mỗi test.
function installDom({ pathname = '/app.html', respond } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>', { url: `http://localhost${pathname}`, pretendToBeVisual: true });
  const saved = {};
  const define = (name, value) => {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  const calls = [];
  define('window', dom.window);
  define('document', dom.window.document);
  define('Node', dom.window.Node);
  define('Element', dom.window.Element);
  define('HTMLElement', dom.window.HTMLElement);
  define('Event', dom.window.Event);
  define('location', { pathname, replace() {} });
  define('fetch', async (url, options) => {
    calls.push({ url, options });
    const { status = 200, body = null } = respond ? respond(url, options) : {};
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
  const restore = () => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  };
  return { dom, document: dom.window.document, calls, restore };
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

// Chờ tới khi điều kiện đúng (tối đa timeoutMs) để không phụ thuộc vào thời điểm render bất đồng bộ.
async function waitFor(condition, { timeoutMs = 3000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = condition();
    if (value) return value;
    if (Date.now() > deadline) throw new Error('waitFor: quá thời gian chờ điều kiện');
    await tick(intervalMs);
  }
}

module.exports = { installDom, frontend, tick, waitFor };
