const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.resolve(__dirname, '../../../frontend/services/realtime.js')).href);
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('frontend realtime SSE subscription', () => {
  it('loads initially, refreshes on message and reconnect, falls back after repeated failures, and closes cleanly', async () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const originalEventSource = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
    const listeners = new Map();
    const sources = [];
    globalThis.document = {
      hidden: false,
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name) => listeners.delete(name),
    };
    globalThis.EventSource = class {
      constructor(url) { this.url = url; sources.push(this); }
      close() { this.closed = true; }
    };

    try {
      const { subscribe } = await load();
      const values = [];
      let loads = 0;
      const subscription = subscribe(
        async () => ++loads,
        (value) => values.push(value),
        { eventsUrl: '/api/fleet-status/events', intervalMs: 100000 },
      );

      await flush();
      assert.deepStrictEqual(values, [1]);
      assert.strictEqual(sources[0].url, '/api/fleet-status/events');

      sources[0].onmessage();
      await flush();
      assert.deepStrictEqual(values, [1, 2]);

      sources[0].onerror();
      sources[0].onerror();
      sources[0].onerror();
      await flush();
      assert.deepStrictEqual(values, [1, 2, 3]);

      sources[0].onopen();
      await flush();
      assert.deepStrictEqual(values, [1, 2, 3, 4]);

      subscription.stop();
      assert.strictEqual(sources[0].closed, true);
      assert.strictEqual(listeners.has('visibilitychange'), false);
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
      else delete globalThis.document;
      if (originalEventSource) Object.defineProperty(globalThis, 'EventSource', originalEventSource);
      else delete globalThis.EventSource;
    }
  });
});
