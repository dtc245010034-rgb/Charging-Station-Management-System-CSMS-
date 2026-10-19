const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(__dirname, '../../../frontend', file)).href);

const PAYLOADS = [
  '<img src=x onerror="window.__xss=1">',
  '<script>window.__xss=1</script>',
  '"><svg onload=window.__xss=1>',
];

// Leaflet coi chuỗi truyền vào bindTooltip/setTooltipContent là HTML; chỉ phần tử DOM mới được xử lý như văn bản.
// Bộ giả lập này ghi lại đúng đối số mà station-map.js đưa cho Leaflet.
function stubLeaflet() {
  class FakeNode { constructor() { this.textContent = ''; this.attrs = {}; this.dataset = {}; } setAttribute(k, v) { this.attrs[k] = v; } append(...c) { this.textContent += c.map((n) => n.textContent).join(''); } addEventListener() {} }
  const saved = {};
  const define = (name, value) => {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  const marker = { tooltips: [], contents: [], title: null };
  const chain = {
    addTo() { return chain; }, setView() { return chain; }, on() { return chain; },
    bindTooltip(content) { marker.tooltips.push(content); return chain; },
    setTooltipContent(content) { marker.contents.push(content); return chain; },
    setIcon() {}, remove() {}, invalidateSize() {}, fitBounds() {},
  };
  const fakeLeaflet = {
    map: () => chain, tileLayer: () => chain, divIcon: () => ({}), latLngBounds: () => ({}),
    marker: (_pos, opts) => { marker.title = opts.title; return chain; },
  };
  define('Node', FakeNode);
  define('document', { createElement: () => new FakeNode(), createTextNode: (t) => { const n = new FakeNode(); n.textContent = t; return n; } });
  define('L', fakeLeaflet);
  const restore = () => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  return { marker, restore };
}

describe('C1: bản đồ trạm không chèn HTML từ tên trạm', () => {
  let restore;
  afterEach(() => restore?.());

  for (const payload of PAYLOADS) {
    it(`bindTooltip nhận phần tử văn bản, không nhận chuỗi HTML: ${payload}`, async () => {
      const stub = stubLeaflet();
      restore = stub.restore;
      const { createStationMap } = await load('components/station-map.js');
      const map = createStationMap(new Node(), { onSelect() {} });
      map.update([{ id: 1, name: payload, lat: 10, lng: 106, group: 'ok' }]);
      await map.ready;

      assert.strictEqual(stub.marker.tooltips.length, 1);
      const tooltip = stub.marker.tooltips[0];
      assert.notStrictEqual(typeof tooltip, 'string', 'Leaflet sẽ gán chuỗi này vào innerHTML');
      assert.strictEqual(tooltip.textContent, payload, 'nội dung hiển thị phải là văn bản nguyên văn');
    });

    it(`setTooltipContent (cập nhật marker có sẵn) cũng nhận phần tử văn bản: ${payload}`, async () => {
      const stub = stubLeaflet();
      restore = stub.restore;
      const { createStationMap } = await load('components/station-map.js');
      const map = createStationMap(new Node(), { onSelect() {} });
      map.update([{ id: 1, name: 'Trạm A', lat: 10, lng: 106, group: 'ok' }]);
      await map.ready;
      map.update([{ id: 1, name: payload, lat: 10, lng: 106, group: 'ok' }]);

      assert.strictEqual(stub.marker.contents.length, 1);
      const content = stub.marker.contents[0];
      assert.notStrictEqual(typeof content, 'string');
      assert.strictEqual(content.textContent, payload);
    });
  }

  it('tên tiếng Việt hợp lệ và giá trị rỗng vẫn hiển thị đúng', async () => {
    const stub = stubLeaflet();
    restore = stub.restore;
    const { createStationMap } = await load('components/station-map.js');
    const map = createStationMap(new Node(), { onSelect() {} });
    map.update([{ id: 1, name: 'Trạm sạc Nguyễn Văn Cừ', lat: 10, lng: 106, group: 'ok' }, { id: 2, name: null, lat: 11, lng: 106, group: 'ok' }]);
    await map.ready;
    assert.strictEqual(stub.marker.tooltips[0].textContent, 'Trạm sạc Nguyễn Văn Cừ');
    assert.strictEqual(stub.marker.tooltips[1].textContent, '');
  });
});
