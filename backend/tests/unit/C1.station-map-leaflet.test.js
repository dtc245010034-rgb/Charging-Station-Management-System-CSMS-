const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { installDom, frontend, waitFor } = require('../helpers/dom');

const LEAFLET = fs.readFileSync(path.resolve(__dirname, '../../../frontend/vendor/leaflet/leaflet.js'), 'utf8');
const PAYLOADS = ['<img src=x onerror="window.__xss=1">', '<script>window.__xss=2</script>'];

// Leaflet thật (bản vendor) chạy trong jsdom: rê chuột vào marker và kiểm tra DOM của tooltip.
describe('C1: tooltip bản đồ với Leaflet thật không thực thi HTML trong tên trạm', () => {
  let env;
  afterEach(() => { delete globalThis.L; env?.restore(); });

  it('hover marker: tooltip hiện tên nguyên văn, không có phần tử img/script, window.__xss không được đặt', async () => {
    env = installDom();
    env.dom.window.eval(LEAFLET);
    globalThis.L = env.dom.window.L;
    const { createStationMap } = await frontend('components/station-map.js');
    const container = env.document.getElementById('root');
    const map = createStationMap(container, { onSelect() {} });
    map.update(PAYLOADS.map((name, i) => ({ id: i + 1, name, lat: 10 + i, lng: 106, group: 'ok' })));
    await map.ready;

    const markers = [...container.querySelectorAll('.leaflet-marker-icon')];
    assert.strictEqual(markers.length, PAYLOADS.length);
    for (const marker of markers) marker.dispatchEvent(new env.dom.window.MouseEvent('mouseover', { bubbles: true }));

    const tooltips = await waitFor(() => {
      const found = [...container.querySelectorAll('.leaflet-tooltip')];
      return found.length === PAYLOADS.length ? found : null;
    });
    assert.deepStrictEqual(tooltips.map((t) => t.textContent).sort(), [...PAYLOADS].sort());
    assert.strictEqual(container.querySelectorAll('.leaflet-tooltip img, .leaflet-tooltip script, .leaflet-tooltip svg').length, 0);
    assert.strictEqual(env.dom.window.__xss, undefined);
    assert.strictEqual(globalThis.__xss, undefined);
  });
});
