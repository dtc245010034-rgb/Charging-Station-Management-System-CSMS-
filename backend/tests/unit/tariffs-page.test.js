const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');
const { installDom, frontend, waitFor } = require('../helpers/dom');

const STATION = { id: '1', name: 'Trạm Cầu Giấy', address: '1 Cầu Giấy, Hà Nội', timezone: 'Asia/Ho_Chi_Minh' };
const TARIFFS = [{
  id: '1',
  version: 1,
  state: 'ACTIVE',
  effective_from: '2026-01-01',
  idle_grace_min: 15,
  idle_per_min_dong: '1000',
  periods: [{ start_minute: 0, end_minute: 1440, price_per_kwh_dong: '3850', label: 'Cả ngày' }],
}];

// Giả lập backend: chỉ trả dữ liệu cho đúng mã trạm được hỏi.
function fakeBackend(stationId) {
  return (url) => {
    if (url === `/api/stations/${stationId}`) return { body: { ...STATION, id: stationId } };
    if (url === `/api/stations/${stationId}/tariffs`) return { body: TARIFFS };
    return { status: 404, body: { error: { message: 'không có' } } };
  };
}

// ctx dựng đúng hình dạng như frontend/main.js (showPage): mã trong địa chỉ nằm ở ctx.params.id, không có ctx.id.
function makeCtx(root, { id, can = () => true } = {}) {
  return {
    root,
    workspace: 'owner',
    role: 'STATION_OWNER',
    user: { id: '1', name: 'Chủ trạm', email: 'owner@demo.csms.local', roles: ['STATION_OWNER'] },
    params: { workspace: 'owner', page: 'tariffs', id, query: {} },
    can,
  };
}

describe('Giao diện Biểu giá trạm: mã trạm lấy từ ctx.params.id', () => {
  let env;
  afterEach(() => env?.restore());

  async function open({ id, stationId = id ?? '1', can } = {}) {
    env = installDom({ respond: fakeBackend(stationId) });
    const { render } = await frontend('pages/shared/tariffs.js');
    const root = env.document.getElementById('root');
    render(makeCtx(root, { id, can }));
    return { root, calls: () => env.calls.map((c) => c.url) };
  }

  const hasButton = (root, label) => [...root.querySelectorAll('button')].some((b) => b.textContent.includes(label));

  it('có params.id = 1: gọi API đúng trạm và hiện tên trạm, v1 đang áp dụng, 00:00 – 24:00, 3.850 đ/kWh', async () => {
    const { root, calls } = await open({ id: '1' });
    await waitFor(() => root.textContent.includes('Biểu giá: Trạm Cầu Giấy'));
    assert.deepStrictEqual(calls().sort(), ['/api/stations/1', '/api/stations/1/tariffs']);
    assert.match(root.textContent, /Phiên bản v1/);
    assert.match(root.textContent, /Đang áp dụng/);
    assert.match(root.textContent, /00:00 – 24:00/);
    assert.match(root.textContent, /3\.850 đ\/kWh/);
    assert.doesNotMatch(root.textContent, /Chưa chọn trạm sạc/);
  });

  it('mã trạm lấy từ ctx.params.id: id = 7 thì gọi /api/stations/7 và /api/stations/7/tariffs', async () => {
    const { root, calls } = await open({ id: '7' });
    await waitFor(() => root.textContent.includes('Biểu giá: Trạm Cầu Giấy'));
    assert.deepStrictEqual(calls().sort(), ['/api/stations/7', '/api/stations/7/tariffs']);
  });

  it('không có params.id (bấm menu «Biểu giá»): hiện «Chưa chọn trạm sạc» và không gọi API nào', async () => {
    const { root, calls } = await open({ id: undefined });
    assert.match(root.textContent, /Chưa chọn trạm sạc/);
    assert.deepStrictEqual(calls(), []);
  });

  it('màn «Chưa chọn trạm sạc» có nút «Mở danh sách trạm» dẫn tới danh sách trạm của không gian làm việc', async () => {
    const { root } = await open({ id: undefined });
    const link = [...root.querySelectorAll('a')].find((a) => a.textContent.includes('Mở danh sách trạm'));
    assert.ok(link, 'phải có nút «Mở danh sách trạm»');
    assert.strictEqual(link.getAttribute('href'), '#/owner/stations');
  });

  it('có tariffs:write thì thấy nút «Khai báo biểu giá mới»', async () => {
    const { root } = await open({ id: '1', can: (permission) => permission === 'tariffs:write' });
    await waitFor(() => root.textContent.includes('Biểu giá: Trạm Cầu Giấy'));
    assert.ok(hasButton(root, 'Khai báo biểu giá mới'));
  });

  it('không có tariffs:write thì không thấy nút «Khai báo biểu giá mới»', async () => {
    const { root } = await open({ id: '1', can: () => false });
    await waitFor(() => root.textContent.includes('Biểu giá: Trạm Cầu Giấy'));
    assert.ok(!hasButton(root, 'Khai báo biểu giá mới'));
  });
});
