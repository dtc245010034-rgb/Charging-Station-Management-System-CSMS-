import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { formatDateTime } from '../../app/format.js';
import { openModal } from '../../components/modal.js';
import { toast } from '../../components/toast.js';

const dongFormat = new Intl.NumberFormat('vi-VN');
const distanceFormat = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatDong(value) {
  return `${dongFormat.format(BigInt(value))} đ`;
}

function availableConnectors(station, chargePoints) {
  return chargePoints
    .filter((point) => String(point.station_id) === String(station.stationId))
    .flatMap((point) => (point.connectors || [])
      .filter((connector) => connector.available)
      .map((connector) => ({
        connectorId: String(connector.connector_id),
        connectorNo: connector.connector_no,
        connectorType: connector.connector_type,
        chargePointCode: point.charge_point_code,
      })));
}

function stationResult(station, chargePoints, onReserve) {
  const distance = station.distanceKm === null
    ? 'Chưa có dữ liệu vị trí'
    : `${distanceFormat.format(station.distanceKm)} km`;
  const price = station.price === null
    ? 'Chưa có biểu giá'
    : `${formatDong(station.price.pricePerKwh)} / kWh${station.price.periodLabel ? ` · ${station.price.periodLabel}` : ''}`;
  const idleFee = station.idleFee === null
    ? 'Chưa có thông tin phí chờ'
    : `Ân hạn ${station.idleFee.graceMin} phút · ${formatDong(station.idleFee.perMinDong)} / phút`;

  const connectors = availableConnectors(station, chargePoints);
  const connectorChoices = [...connectors];
  const connectorSelect = h('select', { class: 'select', 'aria-label': `Chọn đầu nối tại ${station.name}` },
    connectors.map((connector) => h('option', { value: connector.connectorId },
      `${connector.chargePointCode} · Đầu ${connector.connectorNo} · ${connector.connectorType}`)));
  connectorSelect.value = connectors[0]?.connectorId ?? '';
  const arriveSelect = h('select', { class: 'select', 'aria-label': 'Thời gian dự kiến đến' },
    [15, 30, 60, 90, 120].map((minutes) => h('option', {
      value: String(minutes),
      selected: minutes === 30,
    }, `${minutes} phút`)));
  const confirmation = h('section', { class: 'card', style: 'padding:12px;display:grid;gap:8px', hidden: true });
  const feedback = h('div', { role: 'status', 'aria-live': 'polite' });
  const reserveButton = h('button', {
    class: 'btn btn--primary',
    type: 'button',
    disabled: connectors.length === 0,
    onclick: () => {
      const connector = connectorChoices.find((item) => item.connectorId === connectorSelect.value);
      if (!connector) return;
      confirmation.hidden = false;
      mount(confirmation,
        h('strong', {}, 'Xác nhận đặt chỗ'),
        h('p', { class: 'muted' }, `${connector.chargePointCode} · Đầu ${connector.connectorNo}; dự kiến đến sau ${arriveSelect.value} phút.`),
        h('div', { class: 'toolbar' },
          h('button', {
            class: 'btn btn--primary',
            type: 'button',
            onclick: () => { void onReserve({
              station,
              connector,
              arriveInMinutes: Number(arriveSelect.value),
              connectorSelect,
              connectorChoices,
              feedback,
              reserveButton,
            }); },
          }, 'Xác nhận đặt chỗ'),
          h('button', { class: 'btn', type: 'button', onclick: () => { confirmation.hidden = true; } }, 'Huỷ')));
    },
  }, icon('calendar'), connectors.length ? 'Đặt chỗ' : 'Chưa có đầu nối phù hợp');

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
    h('p', { class: 'muted' }, idleFee),
    connectors.length
      ? h('div', { class: 'toolbar' }, connectorSelect, arriveSelect, reserveButton)
      : reserveButton,
    confirmation,
    feedback
  );
}

const RESERVATION_STATUS = {
  PENDING: 'Đang chờ trụ xác nhận',
  ACCEPTED: 'Đã đặt chỗ',
  REJECTED: 'Bị từ chối',
  FAILED: 'Không hoàn tất',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
  FULFILLED: 'Đã bắt đầu sạc',
};

function timeRemaining(expiresAt) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function renderMyReservations(ctx) {
  let disposed = false;
  let timer = null;
  const content = h('div', { style: 'display:grid;gap:10px' }, loadingState(2));
  ctx.root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Tài xế'),
        h('h1', { class: 'page-head__title' }, 'Đặt chỗ của tôi')
      ),
      h('a', { class: 'btn', href: '#/driver/find' }, icon('search'), 'Tìm trạm')
    ),
    content
  );

  async function load() {
    mount(content, loadingState(2));
    try {
      const reservations = await api('/api/me/reservations');
      if (disposed) return;
      const countdowns = [];
      const cards = reservations.map((reservation) => {
        const status = RESERVATION_STATUS[reservation.status] || reservation.status;
        const countdown = ['PENDING', 'ACCEPTED'].includes(reservation.status)
          ? h('span', { class: 'mono', 'aria-live': 'polite' }, timeRemaining(reservation.expiresAt))
          : h('span', { class: 'muted' }, '—');
        if (['PENDING', 'ACCEPTED'].includes(reservation.status)) countdowns.push({ el: countdown, expiresAt: reservation.expiresAt });
        const canCancel = reservation.status === 'ACCEPTED' && Date.parse(reservation.expiresAt) > Date.now();
        const cancelButton = canCancel && h('button', {
          class: 'btn btn--danger',
          type: 'button',
          onclick: () => {
            const dismiss = h('button', { class: 'btn', type: 'button' }, 'Giữ đặt chỗ');
            const confirm = h('button', { class: 'btn btn--danger', type: 'button' }, 'Huỷ đặt chỗ');
            const requestError = h('p', { class: 'form-alert', role: 'alert', hidden: true });
            const modal = openModal({
              title: 'Huỷ đặt chỗ?',
              body: h('div', {},
                h('p', {}, 'Huỷ trước hạn sẽ không mất phí. Nếu đặt chỗ hết hạn trước khi yêu cầu được xử lý, phí vắng mặt 20.000 đ có thể được ghi nhận.'),
                requestError),
              footer: [dismiss, confirm],
            });
            dismiss.addEventListener('click', () => modal.close());
            confirm.addEventListener('click', async () => {
              confirm.disabled = true;
              try {
                const result = await api(`/api/me/reservations/${encodeURIComponent(reservation.id)}`, {
                  method: 'DELETE',
                  body: {},
                });
                modal.close();
                toast(result.cancelCommandStatus === 'PENDING'
                  ? 'Đã huỷ chỗ; lệnh tới trụ đang chờ gửi lại.'
                  : 'Đã huỷ đặt chỗ.');
                await load();
              } catch (error) {
                requestError.textContent = error.message;
                requestError.hidden = false;
                confirm.disabled = false;
              }
            });
          },
        }, icon('x'), 'Huỷ đặt chỗ');
        return h('article', { class: 'card', style: 'padding:14px;display:grid;gap:8px' },
          h('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap' },
            h('strong', {}, reservation.stationName),
            h('span', { class: `badge ${reservation.status === 'ACCEPTED' ? 'badge--ready' : 'badge--warning'}` }, status)
          ),
          h('p', { class: 'muted' }, reservation.stationAddress),
          h('p', {}, `${reservation.chargePointCode} · Đầu ${reservation.connectorNo} · ${reservation.connectorType}`),
          h('p', { class: 'muted' }, `Hạn giữ: ${formatDateTime(reservation.expiresAt)}`),
          h('p', { class: 'muted' }, 'Thời gian còn lại: ', countdown),
          reservation.rejectReason ? h('p', { role: 'status' }, reservation.rejectReason) : null,
          reservation.cancelCommandStatus === 'PENDING' && h('p', { class: 'field__hint', role: 'status' }, 'Lệnh huỷ đang chờ được gửi tới trụ.'),
          reservation.cancelCommandStatus === 'REJECTED' && h('p', { class: 'form-alert', role: 'alert' }, 'Trụ đã từ chối lệnh huỷ.'),
          cancelButton
        );
      });
      mount(content, ...(cards.length ? cards : [h('section', { class: 'card', style: 'padding:18px' },
        h('p', { class: 'muted' }, 'Bạn chưa có đặt chỗ nào.'))]));
      clearInterval(timer);
      timer = setInterval(() => {
        if (disposed) return;
        for (const item of countdowns) item.el.textContent = timeRemaining(item.expiresAt);
      }, 1000);
      timer.unref?.();
    } catch (error) {
      if (!disposed) mount(content, errorState({ message: error.message, onRetry: () => { void load(); } }));
    }
  }

  void load();
  return () => { disposed = true; clearInterval(timer); };
}

export function render(ctx) {
  if (ctx.params?.page === 'reservations') return renderMyReservations(ctx);
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
      const [stations, chargePoints] = await Promise.all([
        api('/api/stations/search', { method: 'POST', body }),
        api('/api/driver/charge-points'),
      ]);
      if (disposed) return;
      mount(message, h('span', { class: 'muted', 'aria-live': 'polite' }, `${stations.length} trạm`));
      if (stations.length) {
        mount(content, ...stations.map((station) => stationResult(station, chargePoints, async ({
          station: selectedStation,
          connector,
          arriveInMinutes,
          connectorSelect,
          connectorChoices,
          feedback,
          reserveButton,
        }) => {
          reserveButton.disabled = true;
          mount(feedback, h('span', { role: 'status' }, 'Đang gửi yêu cầu đặt chỗ…'));
          try {
            const idempotencyKey = globalThis.crypto?.randomUUID?.()
              ?? `reservation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const reservation = await api('/api/reservations', {
              method: 'POST',
              headers: { 'Idempotency-Key': idempotencyKey },
              body: { connectorId: connector.connectorId, arriveInMinutes },
            });
            if (disposed) return;
            mount(feedback,
              h('p', { class: 'badge badge--ready', role: 'status' },
                reservation.status === 'ACCEPTED' ? 'Đặt chỗ thành công. ' : 'Đang chờ trụ xác nhận. ',
                `Còn ${timeRemaining(reservation.expiresAt)}.`),
              h('a', { class: 'btn btn--ghost', href: '#/driver/reservations' }, 'Đặt chỗ của tôi'));
          } catch (error) {
            const messageText = error.code === 'WALLET_BELOW_MIN'
              ? 'Số dư ví chưa đủ để đặt chỗ. Vui lòng nạp thêm tiền.'
              : error.code === 'STATION_NOT_ACTIVE'
                ? 'Trạm hiện không hoạt động. Hãy tìm trạm khác.'
                : error.code === 'RESERVATION_OCCUPIED'
                  ? 'Đầu nối đang được sử dụng. Hãy chọn đầu nối gợi ý.'
                  : error.message;
            mount(feedback, h('p', { class: 'form-alert', role: 'alert' }, messageText));
            if (error.code === 'WALLET_BELOW_MIN') {
              feedback.append(h('a', { class: 'btn btn--primary', href: '#/driver/wallet' }, 'Nạp tiền'));
            }
            const suggestions = error.details?.suggestions ?? error.details?.[0]?.suggestions ?? [];
            if (error.code === 'CONNECTOR_RESERVED' && suggestions.length) {
              feedback.append(h('p', { class: 'muted' }, 'Đầu nối gợi ý:'));
              for (const suggestion of suggestions.slice(0, 5)) {
                const connectorId = String(suggestion.connectorId);
                if (!connectorChoices.some((item) => item.connectorId === connectorId)) {
                  connectorChoices.push({
                    connectorId,
                    connectorNo: suggestion.connectorNo,
                    connectorType: suggestion.connectorType,
                    chargePointCode: suggestion.chargePointCode,
                  });
                  connectorSelect.append(h('option', { value: connectorId },
                    `${suggestion.chargePointCode} · Đầu ${suggestion.connectorNo} · ${suggestion.connectorType}`));
                }
                feedback.append(h('button', {
                  class: 'btn',
                  type: 'button',
                  onclick: () => { connectorSelect.value = connectorId; },
                }, `${suggestion.chargePointCode} · Đầu ${suggestion.connectorNo} · ${suggestion.connectorType}`));
              }
            }
          } finally {
            reserveButton.disabled = false;
          }
          void selectedStation;
        })));
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