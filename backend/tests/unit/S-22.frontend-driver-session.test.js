const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(__dirname, '../../../frontend', file)).href);

describe('S-22: Frontend driver session page unit tests', () => {
  it('driver/session.js xuất hàm render(ctx)', async () => {
    const mod = await load('pages/driver/session.js');
    assert.strictEqual(typeof mod.render, 'function');
  });

  it('driver/session render trả về hàm cleanup dọn dẹp EventSource và Timer', async () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const originalNode = Object.getOwnPropertyDescriptor(globalThis, 'Node');
    const originalEventSource = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
    const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');

    globalThis.Node = class {};
    globalThis.document = {
      createElement: () => ({
        setAttribute() {},
        addEventListener() {},
        append() {},
        replaceChildren() {},
      }),
      createElementNS: () => ({
        setAttribute() {},
        append() {},
      }),
      createTextNode: (text) => ({ text }),
    };

    let eventSourceClosed = false;
    globalThis.EventSource = class {
      constructor(url) {
        this.url = url;
      }
      close() {
        eventSourceClosed = true;
      }
    };

    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        id: 1,
        station: { name: 'Trạm A', address: 'Địa chỉ A' },
        charge_point: { code: 'CP-01' },
        connector: { connector_no: 1 },
        started_at: new Date().toISOString(),
        latest_reading: { energy_kwh: 5.0, power_kw: 22.0 },
      }),
    });

    try {
      const { render } = await load('pages/driver/session.js');
      const root = {
        append: () => {},
      };
      const cleanup = render({ root, user: { id: 10, role: 'DRIVER', name: 'Nguyễn Văn A' } });
      assert.strictEqual(typeof cleanup, 'function');

      // Chờ microtasks hoàn thành nạp fetch
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Gọi cleanup và kiểm chứng EventSource được đóng sạch sẽ
      cleanup();
      assert.strictEqual(eventSourceClosed, true);
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
      else delete globalThis.document;
      if (originalNode) Object.defineProperty(globalThis, 'Node', originalNode);
      else delete globalThis.Node;
      if (originalEventSource) Object.defineProperty(globalThis, 'EventSource', originalEventSource);
      else delete globalThis.EventSource;
      if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
      else delete globalThis.fetch;
    }
  });

  it('router có loader cho trang sessions của driver', async () => {
    const { pageLoader, PAGE_NEEDS } = await load('app/router.js');
    assert.strictEqual(PAGE_NEEDS.sessions, 'sessions:read-own');
    const loader = pageLoader('sessions', 'driver');
    assert.strictEqual(typeof loader, 'function');
  });
});
