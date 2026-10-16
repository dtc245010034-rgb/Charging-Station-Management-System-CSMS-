import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';

const dongFormat = new Intl.NumberFormat('vi-VN');
const distanceFormat = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatDong(value) {
  return `${dongFormat.format(BigInt(value))} đ`;
}

function stationResult(station) {
  const distance = station.distanceKm === null
    ? 'Chưa có dữ liệu vị trí'
    : `${distanceFormat.format(station.distanceKm)} km`;
  const price = station.price === null
    ? 'Chưa có biểu giá'
    : `${formatDong(station.price.pricePerKwh)} / kWh${station.price.periodLabel ? ` · ${station.price.periodLabel}` : ''}`;
  const idleFee = station.idleFee === null
    ? 'Chưa có thông tin phí chờ'
    : `Ân hạn ${station.idleFee.graceMin} phút · ${formatDong(station.idleFee.perMinDong)} / phút`;

  return h('article', { class: 'card', style: 'padding:14px;display:grid;gap:8px' },
    h('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap' },
      h('div', { style: 'min-width:0' },
        h('h2', { class: 'card__title', style: 'overflow-wrap:anywhere' }, station.name),
        h('p', { class: 'muted', style: 'margin-top:4px;overflow-wrap:anywhere' }, station.address || 'Chưa có địa chỉ')
      ),
      h('span', { class: 'badge badge--brand' }, distance)
    ),
    h('div', { class: 'list-row', style: 'flex-wrap:wrap' },
      h('strong', {}, `${station.connectors.free}/${station.connectors.total} đầu nối rảnh`),
      h('span', { class: 'muted' }, station.connectors.types.length ? station.connectors.types.join(', ') : 'Chưa khai báo loại đầu nối')
    ),
    h('p', {}, price),
    h('p', { class: 'muted' }, idleFee)
  );
}

export function render(ctx) {
  let disposed = false;
  let searching = false;
  const queryInput = h('input', {
     class: 'input',
    type: 'search',
    maxlength: 100,
    autocomplete: 'off',
    placeholder: 'Tên trạm hoặc địa chỉ',
    'aria-label': 'Tìm theo tên hoặc địa chỉ',
  });
  const message = h('div', { role: 'status', 'aria-live': 'polite' });
  const nameSearchButton = h('button', { class: 'btn btn--primary', type: 'submit' }, icon('search'), 'Tìm kiếm');
  const locationButton = h('button', {
    class: 'btn',
    type: 'button',
    onclick: searchNearby,
  }, icon('map'), 'Vị trí hiện tại');
  const content = h('div', { class: 'page-stack', style: 'width:100%;max-width:720px;margin:0 auto;display:grid;gap:14px' });
  const form = h('form', {
    class: 'toolbar',
    onsubmit: (event) => {
      event.preventDefault();
      void searchByName();
    },
  }, queryInput, nameSearchButton, locationButton);

  ctx.root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Tài xế'),
        h('h1', { class: 'page-head__title' }, 'Tìm trạm')
      )
    ),
    form,
    message,
    content
  );

  async function search(body) {
    if (searching || disposed) return;
    searching = true;
    nameSearchButton.disabled = true;
    locationButton.disabled = true;
    mount(message);
    mount(content, loadingState(2));
    try {
      const stations = await api('/api/stations/search', { method: 'POST', body });
      if (disposed) return;
      mount(message, h('span', { class: 'muted', 'aria-live': 'polite' }, `${stations.length} trạm`));
      if (stations.length) {
        mount(content, ...stations.map(stationResult));
      } else {
        mount(content, h('section', { class: 'card' }, h('p', { class: 'muted', style: 'padding:18px' }, 'Không tìm thấy trạm phù hợp')));
      }
    } catch (error) {
      if (!disposed) mount(content, errorState({ message: error.message, onRetry: () => { void search(body); } }));
    } finally {
      searching = false;
      nameSearchButton.disabled = false;
      locationButton.disabled = false;
    }
  }

  function searchByName() {
    const q = queryInput.value.trim();
    if (q.length < 2 || q.length > 100) {
      mount(message, h('span', { class: 'field__error', role: 'alert' }, 'Nhập từ 2 đến 100 ký tự.'));
      return;
    }
    return search({ q });
  }

  function searchNearby() {
    if (!navigator.geolocation) {
      mount(message, h('span', { class: 'field__hint', role: 'status' }, 'Trình duyệt không hỗ trợ vị trí. Bạn vẫn có thể tìm theo tên hoặc địa chỉ.'));
      return;
    }
    locationButton.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (disposed) return;
        void search({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        locationButton.disabled = false;
        mount(message, h('span', { class: 'field__hint', role: 'status' }, 'Không có quyền vị trí. Bạn vẫn có thể tìm theo tên hoặc địa chỉ.'));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
    );
  }

  return () => { disposed = true; };
}