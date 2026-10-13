import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { icon } from '../../components/icons.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { formatDateTime, formatNumber } from '../../app/format.js';

const STATUS_LABELS = {
  FINAL: 'Đã chốt hóa đơn',
  REVIEW: 'Cần kiểm tra hóa đơn',
  WAITING_IDLE: 'Đang chờ rút súng sạc',
  ERROR: 'Chưa thể lập hóa đơn',
  SKIPPED: 'Không lập hóa đơn',
};

function sessionCard(session) {
  const invoiceLink = h('a', {
    class: 'btn',
    href: `#/driver/invoice/${encodeURIComponent(session.id)}`,
  }, 'Xem hóa đơn');
  return h('article', { class: 'card', style: 'padding:16px;display:grid;gap:10px' },
    h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      h('strong', {}, session.stationName || session.chargePointCode || 'Phiên sạc'),
      h('span', { class: 'muted' }, formatDateTime(session.stoppedAt))
    ),
    h('span', { class: 'muted' }, `${session.chargePointCode} · Cổng ${session.connectorNo} · Phiên #${session.id}`),
    h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      h('span', {}, session.currentKwh === null ? 'Điện năng: —' : `Điện năng: ${formatNumber(session.currentKwh)} kWh`),
      h('span', {}, session.invoiceTotalDong === null
        ? (STATUS_LABELS[session.billingStatus] || 'Đang xử lý hóa đơn')
        : `Tổng: ${formatNumber(session.invoiceTotalDong)} đ`)
    ),
    invoiceLink
  );
}

export function render(ctx) {
  let disposed = false;
  let loading = false;
  let cursor = null;
  let items = [];
  const root = h('div', { class: 'page-stack', style: 'max-width:720px;margin:0 auto' });
  const list = h('div', { style: 'display:grid;gap:12px' }, loadingState(3));
  const loadMore = h('button', {
    class: 'btn',
    type: 'button',
    style: 'display:none',
    onclick: () => { void loadPage({ append: true }); },
  }, 'Tải thêm');
  const refresh = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    'aria-label': 'Làm mới lịch sử',
    onclick: () => { void loadPage({ append: false }); },
  }, icon('refresh'));
  root.append(
    h('header', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Tài xế'), h('h1', { class: 'page-head__title' }, 'Lịch sử phiên sạc')),
      refresh
    ),
    list,
    loadMore
  );
  ctx.root.replaceChildren(root);

  async function loadPage({ append }) {
    if (loading || disposed) return;
    loading = true;
    loadMore.disabled = true;
    if (!append) {
      cursor = null;
      items = [];
      mount(list, loadingState(3));
    }
    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const result = await api(`/api/me/sessions/history${query}`);
      if (disposed) return;
      items = append ? [...items, ...result.items] : result.items;
      cursor = result.nextCursor;
      loadMore.textContent = 'Tải thêm';
      mount(list, items.length
        ? items.map(sessionCard)
        : h('section', { class: 'card', style: 'padding:20px' }, emptyState({
          iconName: 'history',
          title: 'Chưa có phiên sạc đã kết thúc',
          text: 'Các phiên sạc của bạn sẽ xuất hiện ở đây sau khi kết thúc.',
        }))
      );
      loadMore.style.display = cursor ? 'block' : 'none';
    } catch (error) {
      if (!disposed) {
        if (!append) mount(list, errorState({ message: error.message, onRetry: () => { void loadPage({ append: false }); } }));
        else {
          loadMore.textContent = 'Không tải được — thử lại';
          loadMore.dataset.cursor = cursor || '';
        }
      }
    } finally {
      loading = false;
      loadMore.disabled = false;
    }
  }

  void loadPage({ append: false });
  return () => { disposed = true; };
}
