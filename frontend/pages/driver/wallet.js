import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { formatDateTime } from '../../app/format.js';

const dongFormat = new Intl.NumberFormat('vi-VN');
const ENTRY_LABELS = {
  TOPUP_GATEWAY: 'Nạp qua cổng thanh toán',
  TOPUP_MANUAL: 'Nạp tiền thủ công',
  SESSION_DEBIT: 'Trừ tiền sạc',
  ADJUSTMENT: 'Điều chỉnh số dư',
  RESERVATION_FEE: 'Phí đặt chỗ',
  SUBSCRIPTION_FEE: 'Phí gói thuê bao',
};

function formatDong(value) {
  return `${dongFormat.format(BigInt(value))} đ`;
}

function transactionReference(entry, page) {
  if (entry.sessionId) {
    return h('a', {
      class: 'btn btn--ghost',
      href: `#/driver/invoice/${encodeURIComponent(entry.sessionId)}`,
    }, 'Xem hóa đơn');
  }
  if (entry.type === 'TOPUP_GATEWAY' || entry.type === 'TOPUP_MANUAL') {
    return h('a', {
      class: 'btn btn--ghost',
      href: `#/driver/wallet?page=${page}&entry=${encodeURIComponent(entry.id)}`,
    }, 'Xem lần nạp');
  }
  return null;
}

function transactionCard(entry, page) {
  const link = transactionReference(entry, page);
  return h('article', {
    class: 'card',
    id: `wallet-entry-${entry.id}`,
    style: 'padding:14px;display:grid;gap:8px',
  },
  h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap' },
    h('strong', {}, ENTRY_LABELS[entry.type] || entry.type),
    h('strong', {}, formatDong(entry.amountDong))
  ),
  h('span', { class: 'muted' }, formatDateTime(entry.at)),
  h('span', { class: 'muted' }, `Số dư sau giao dịch: ${formatDong(entry.balanceAfterDong)}`),
  link);
}

export function render(ctx) {
  let disposed = false;
  let loading = false;
  const requestedPage = Number(ctx.params.query.page || 1);
  let currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const entryToFocus = ctx.params.query.entry;
  const content = h('div', { style: 'display:grid;gap:12px' }, loadingState(3));
  const prevButton = h('button', {
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
  const nextButton = h('button', {
    class: 'btn',
    type: 'button',
    disabled: true,
    onclick: () => {
      currentPage += 1;
      void loadPage();
    },
  }, 'Trang sau »');
  const pageLabel = h('span', { class: 'muted', 'aria-live': 'polite' }, `Trang ${currentPage}`);
  const pagination = h('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;gap:12px',
  }, prevButton, pageLabel, nextButton);

  ctx.root.replaceChildren(
    h('header', {}, h('p', { class: 'eyebrow' }, 'Tài xế'), h('h1', { class: 'page-head__title' }, 'Ví của tôi')),
    content,
    pagination
  );

  async function loadPage() {
    if (loading || disposed) return;
    loading = true;
    prevButton.disabled = true;
    nextButton.disabled = true;
    mount(content, loadingState(3));

    try {
      const driverId = encodeURIComponent(ctx.user.id);
      const [wallet, transactions] = await Promise.all([
        api(`/api/drivers/${driverId}/wallet`),
        api(`/api/drivers/${driverId}/wallet/transactions?page=${currentPage}`),
      ]);
      if (disposed) return;

      currentPage = transactions.page;
      pageLabel.textContent = `Trang ${currentPage}`;
      prevButton.disabled = currentPage <= 1;
      nextButton.disabled = !transactions.hasMore;
      const balance = BigInt(wallet.balanceDong);
      const banners = [
        wallet.inDebt
          ? h('p', { class: 'badge badge--warning', role: 'status' }, `Đang nợ ${formatDong(-balance)}.`)
          : null,
        wallet.locked
          ? h('p', { class: 'badge badge--danger', role: 'alert' }, 'Ví đang bị khóa để kiểm tra. Vui lòng liên hệ hỗ trợ.')
          : null,
      ];
      const rows = transactions.items.map((entry) => transactionCard(entry, currentPage));
      mount(content,
        h('section', { class: 'card', style: 'padding:20px;display:grid;gap:10px' },
          h('span', { class: 'eyebrow' }, 'Số dư hiện tại'),
          h('strong', { style: 'font-size:32px;color:var(--brand-primary)' }, formatDong(wallet.balanceDong)),
          ...banners,
          h('span', { class: 'muted' }, `Ngưỡng bắt đầu sạc: ${formatDong(wallet.minBalanceDong)}`)
        ),
        rows.length
          ? h('section', { style: 'display:grid;gap:10px', 'aria-label': 'Giao dịch ví' }, ...rows)
          : h('section', { class: 'card', style: 'padding:20px' }, emptyState({
            iconName: 'wallet',
            title: 'Chưa có giao dịch ví',
            text: 'Các lần nạp và khoản trừ sẽ xuất hiện ở đây.',
          }))
      );
      pagination.hidden = currentPage === 1 && !transactions.hasMore;
      if (entryToFocus) document.getElementById(`wallet-entry-${entryToFocus}`)?.scrollIntoView({ block: 'center' });
    } catch (error) {
      if (!disposed) {
        mount(content, errorState({ message: error.message, onRetry: () => { void loadPage(); } }));
        pagination.hidden = true;
      }
    } finally {
      loading = false;
    }
  }

  void loadPage();
  return () => { disposed = true; };
}
