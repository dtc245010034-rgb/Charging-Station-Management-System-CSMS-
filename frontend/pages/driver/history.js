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
    session.tariffSource === 'SUBSCRIPTION'
      ? h('div', { class: 'badge badge--success', style: 'width:fit-content' }, `Áp dụng gói: ${session.subscriptionPlanName || session.subscriptionPlanCode || 'Gói thuê bao'}`)
      : null,
    invoiceLink
  );
}

export function render(ctx) {
  let disposed = false;
  let loading = false;
  let currentPage = 1;
  let totalPages = 1;
  let selectedMonth = '';

  const root = h('div', { class: 'page-stack', style: 'max-width:720px;margin:0 auto' });
  const list = h('div', { style: 'display:grid;gap:12px' }, loadingState(3));

  const monthInput = h('input', {
    type: 'month',
    id: 'driver-history-month',
    class: 'input',
    style: 'max-width:160px;padding:6px 10px',
    'aria-label': 'Lọc theo tháng',
    onchange: (e) => {
      selectedMonth = e.target.value || '';
      currentPage = 1;
      void loadPage();
    },
  });

  const refreshBtn = h('button', {
    class: 'btn btn--ghost',
    type: 'button',
    'aria-label': 'Làm mới lịch sử',
    onclick: () => { void loadPage(); },
  }, icon('refresh'));

  const prevBtn = h('button', {
    class: 'btn',
    type: 'button',
    disabled: true,
    onclick: () => {
      if (currentPage > 1) {
        currentPage -= 1;
        void loadPage();
      }
    },
  }, '« Trang trước');

  const pageInfo = h('span', { class: 'muted', style: 'font-size:14px' }, 'Trang 1 / 1');

  const nextBtn = h('button', {
    class: 'btn',
    type: 'button',
    disabled: true,
    onclick: () => {
      if (currentPage < totalPages) {
        currentPage += 1;
        void loadPage();
      }
    },
  }, 'Trang sau »');

  const paginationBar = h('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px',
  }, prevBtn, pageInfo, nextBtn);

  root.append(
    h('header', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Tài xế'), h('h1', { class: 'page-head__title' }, 'Lịch sử phiên sạc')),
      h('div', { style: 'display:flex;align-items:center;gap:8px' }, monthInput, refreshBtn)
    ),
    list,
    paginationBar
  );
  ctx.root.replaceChildren(root);

  async function loadPage() {
    if (loading || disposed) return;
    loading = true;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    mount(list, loadingState(3));

    try {
      const monthQuery = selectedMonth ? `&month=${encodeURIComponent(selectedMonth)}` : '';
      const result = await api(`/api/me/sessions/history?page=${currentPage}${monthQuery}`);
      if (disposed) return;

      const items = result.items || [];
      totalPages = result.totalPages || 1;
      currentPage = result.page || 1;

      mount(list, items.length
        ? items.map(sessionCard)
        : h('section', { class: 'card', style: 'padding:20px' }, emptyState({
          iconName: 'history',
          title: selectedMonth ? `Không có phiên sạc nào trong tháng ${selectedMonth}` : 'Chưa có phiên sạc đã kết thúc',
          text: 'Các phiên sạc của bạn sẽ xuất hiện ở đây sau khi kết thúc.',
        }))
      );

      pageInfo.textContent = `Trang ${currentPage} / ${totalPages} (${result.total || items.length} phiên)`;
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;
      paginationBar.style.display = (totalPages > 1 || items.length > 0) ? 'flex' : 'none';
    } catch (error) {
      if (!disposed) {
        mount(list, errorState({ message: error.message, onRetry: () => { void loadPage(); } }));
        paginationBar.style.display = 'none';
      }
    } finally {
      loading = false;
    }
  }

  void loadPage();
  return () => { disposed = true; };
}
