import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { formatDateTime } from '../../app/format.js';

const EVENT_TEXT = {
  SESSION_ENDED: 'Phiên sạc đã kết thúc',
  SESSION_REMOTE_STOPPED: 'Phiên sạc đã bị dừng từ xa',
  IDLE_FEE_STARTED: 'Phiên sạc bắt đầu tính phí chiếm trụ',
};
const dongFormat = new Intl.NumberFormat('vi-VN');

function formatKwh(wh) {
  const value = BigInt(wh);
  const whole = value / 1000n;
  const fraction = String(value % 1000n).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function notificationCard(item, onRead) {
  const { wh, estimatedDong } = item.payload || {};
  const details = [];
  if (wh !== undefined && wh !== null) details.push(`${formatKwh(wh)} kWh`);
  details.push(estimatedDong === null || estimatedDong === undefined
    ? 'Tạm tính: chưa có biểu giá để ước tính'
    : `Tạm tính ${dongFormat.format(estimatedDong)} đ`);

  return h('article', {
    class: 'card',
    style: 'padding:16px;display:grid;gap:8px',
  },
  h('strong', {}, EVENT_TEXT[item.kind] || 'Thông báo phiên sạc'),
  h('span', { class: 'muted' }, details.join(' · ')),
  h('span', { class: 'muted' }, formatDateTime(item.createdAt)),
  item.readAt ? h('span', { class: 'badge badge--neutral' }, 'Đã đọc')
    : h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      onclick: () => onRead(item.id),
    }, 'Đánh dấu đã đọc'));
}

export function render(ctx) {
  let disposed = false;
  const content = h('div', { style: 'display:grid;gap:12px' }, loadingState(3));

  async function load() {
    mount(content, loadingState(3));
    try {
      const result = await api('/api/me/notifications');
      if (disposed) return;
      const cards = result.notifications.length
        ? result.notifications.map((item) => notificationCard(item, markRead))
        : [emptyState({
          iconName: 'bell',
          title: 'Chưa có thông báo',
          text: 'Thông báo phiên sạc sẽ xuất hiện tại đây.',
        })];
      mount(content, ...cards);
    } catch (error) {
      if (!disposed) mount(content, errorState({ message: error.message, onRetry: load }));
    }
  }

  async function markRead(id) {
    try {
      await api(`/api/me/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
      await load();
    } catch (error) {
      if (!disposed) mount(content, errorState({ message: error.message, onRetry: load }));
    }
  }

  ctx.root.replaceChildren(
    h('header', {},
      h('p', { class: 'eyebrow' }, 'Tài xế'),
      h('h1', { class: 'page-head__title' }, 'Thông báo')),
    content
  );
  void load();
  return () => { disposed = true; };
}
