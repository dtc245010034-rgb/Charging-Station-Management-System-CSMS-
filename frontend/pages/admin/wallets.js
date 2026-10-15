import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { formatDateTime } from '../../app/format.js';

const ENTRY_LABELS = {
  TOPUP_GATEWAY: 'Nạp qua cổng thanh toán',
  TOPUP_MANUAL: 'Nạp tiền thủ công',
  SESSION_DEBIT: 'Trừ tiền sạc',
  ADJUSTMENT: 'Điều chỉnh số dư',
  RESERVATION_FEE: 'Phí đặt chỗ',
  SUBSCRIPTION_FEE: 'Phí gói thuê bao',
};
const dongFormat = new Intl.NumberFormat('vi-VN');

function formatDong(value) {
  return `${dongFormat.format(BigInt(value))} đ`;
}

function transactionCard(entry) {
  return h('article', { class: 'card', style: 'padding:12px;display:grid;gap:6px' },
    h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      h('strong', {}, ENTRY_LABELS[entry.type] || entry.type),
      h('strong', {}, formatDong(entry.amountDong))
    ),
    h('span', { class: 'muted' }, `${formatDateTime(entry.at)} · Số dư sau giao dịch: ${formatDong(entry.balanceAfterDong)}`),
    entry.sessionId ? h('span', { class: 'muted' }, `Phiên #${entry.sessionId}`) : null,
    entry.topupId ? h('span', { class: 'muted' }, `Lần nạp #${entry.topupId}`) : null
  );
}

function field(label, input) {
  return h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, label), input);
}

export function render(ctx) {
  let disposed = false;
  let searching = false;
  let loadingWallet = false;
  let selectedDriver = null;
  let transactionPage = 1;
  let transactionsHasMore = false;

  const searchInput = h('input', {
    class: 'input',
    type: 'search',
    maxlength: 200,
    autocomplete: 'off',
    placeholder: 'Email hoặc mã tài xế',
    'aria-label': 'Tìm theo email hoặc mã tài xế',
    value: ctx.params.query.query ?? '',
  });
  const searchResults = h('div', { style: 'display:grid;gap:10px' }, emptyState({
    iconName: 'users',
    title: 'Tìm tài xế',
    text: 'Nhập email hoặc mã tài xế để xem ví.',
  }));
  const walletDetails = h('div', {});
  const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'muted' });
  const previousButton = h('button', {
    class: 'btn',
    type: 'button',
    disabled: true,
    onclick: () => {
      if (transactionPage > 1) {
        transactionPage -= 1;
        void loadWallet();
      }
    },
  }, '« Trang trước');
  const nextButton = h('button', {
    class: 'btn',
    type: 'button',
    disabled: true,
    onclick: () => {
      if (transactionsHasMore) {
        transactionPage += 1;
        void loadWallet();
      }
    },
  }, 'Trang sau »');
  const pageLabel = h('span', { class: 'muted', 'aria-live': 'polite' });
  const pagination = h('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;gap:12px',
  }, previousButton, pageLabel, nextButton);

  const topupAmount = h('input', {
    class: 'input', type: 'number', min: '1', max: '100000000', step: '1', required: true,
    inputmode: 'numeric', 'aria-label': 'Số tiền nạp, đồng',
  });
  const receiptCode = h('input', {
    class: 'input', type: 'text', minlength: '3', maxlength: '40',
    pattern: '[A-Za-z0-9._-]+', required: true, 'aria-label': 'Mã phiếu thu',
  });
  const topupNote = h('textarea', {
    class: 'input', maxlength: '500', rows: '2', 'aria-label': 'Ghi chú nạp tiền',
  });
  const topupForm = h('form', {
    class: 'card',
    style: 'padding:16px;display:grid;gap:10px',
    onsubmit: (event) => {
      event.preventDefault();
      const body = {
        amountDong: topupAmount.value,
        receiptCode: receiptCode.value,
      };
      if (topupNote.value.trim()) body.note = topupNote.value.trim();
      void submitOperation('manual-topups', body, 'Đã ghi nhận lần nạp tiền.');
    },
  },
  h('h2', { style: 'margin:0;font-size:18px' }, 'Nạp tiền thủ công'),
  field('Số tiền (đ)', topupAmount),
  field('Mã phiếu thu', receiptCode),
  field('Ghi chú (không bắt buộc)', topupNote),
  h('button', { class: 'btn btn--primary', type: 'submit' }, 'Ghi nhận nạp tiền'));

  const adjustmentAmount = h('input', {
    class: 'input', type: 'number', step: '1', required: true, 'aria-label': 'Số tiền điều chỉnh, đồng',
  });
  const adjustmentReason = h('textarea', {
    class: 'input', minlength: '10', maxlength: '500', rows: '2', required: true,
    'aria-label': 'Lý do điều chỉnh',
  });
  const adjustmentForm = h('form', {
    class: 'card',
    style: 'padding:16px;display:grid;gap:10px',
    onsubmit: (event) => {
      event.preventDefault();
      void submitOperation('adjustments', {
        amountDong: adjustmentAmount.value,
        reason: adjustmentReason.value.trim(),
      }, 'Đã điều chỉnh số dư ví.');
    },
  },
  h('h2', { style: 'margin:0;font-size:18px' }, 'Điều chỉnh số dư'),
  field('Số tiền có dấu (đ)', adjustmentAmount),
  field('Lý do (ít nhất 10 ký tự)', adjustmentReason),
  h('button', { class: 'btn', type: 'submit' }, 'Điều chỉnh ví'));

  const unlockReason = h('textarea', {
    class: 'input', minlength: '10', maxlength: '500', rows: '2', required: true,
    'aria-label': 'Lý do mở khóa ví',
  });
  const unlockForm = h('form', {
    class: 'card',
    style: 'padding:16px;display:grid;gap:10px',
    onsubmit: (event) => {
      event.preventDefault();
      void submitOperation('unlock', { reason: unlockReason.value.trim() }, 'Đã mở khóa ví.');
    },
  },
  h('h2', { style: 'margin:0;font-size:18px' }, 'Mở khóa ví'),
  field('Lý do (ít nhất 10 ký tự)', unlockReason),
  h('button', { class: 'btn', type: 'submit' }, 'Mở khóa ví'));

  const root = h('div', { class: 'page-stack', style: 'max-width:1100px;margin:0 auto' });
  root.append(
    h('header', {}, h('p', { class: 'eyebrow' }, 'Quản trị'), h('h1', { class: 'page-head__title' }, 'Quản lý ví tài xế')),
    h('form', {
      class: 'card',
      style: 'padding:16px;display:flex;gap:10px;align-items:end;flex-wrap:wrap',
      onsubmit: (event) => {
        event.preventDefault();
        void searchDrivers();
      },
    },
    field('Email hoặc mã tài xế', searchInput),
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Tìm tài xế')),
    searchResults,
    status,
    walletDetails,
    pagination
  );
  ctx.root.replaceChildren(root);

  async function searchDrivers() {
    if (searching || disposed) return;
    searching = true;
    status.textContent = '';
    mount(searchResults, loadingState(2));
    try {
      const result = await api(`/api/admin/wallets?query=${encodeURIComponent(searchInput.value.trim())}`);
      if (disposed) return;
      mount(searchResults, result.items.length
        ? result.items.map((driver) => h('button', {
          class: 'card',
          type: 'button',
          style: 'padding:14px;text-align:left;display:grid;gap:4px',
          onclick: () => {
            selectedDriver = driver;
            transactionPage = 1;
            void loadWallet();
          },
        },
        h('strong', {}, `${driver.name} · #${driver.driverId}`),
        h('span', { class: 'muted' }, driver.email),
        h('span', { class: 'muted' }, `${formatDong(driver.balanceDong)}${driver.locked ? ' · Ví đang khóa' : ''}`)))
        : emptyState({ iconName: 'users', title: 'Không tìm thấy tài xế phù hợp' }));
    } catch (error) {
      if (!disposed) mount(searchResults, errorState({ message: error.message, onRetry: () => { void searchDrivers(); } }));
    } finally {
      searching = false;
    }
  }

  async function loadWallet() {
    if (!selectedDriver || loadingWallet || disposed) return;
    loadingWallet = true;
    mount(walletDetails, loadingState(3));
    previousButton.disabled = true;
    nextButton.disabled = true;
    try {
      const driverId = encodeURIComponent(selectedDriver.driverId);
      const [wallet, transactions] = await Promise.all([
        api(`/api/drivers/${driverId}/wallet`),
        api(`/api/drivers/${driverId}/wallet/transactions?page=${transactionPage}`),
      ]);
      if (disposed) return;
      transactionPage = transactions.page;
      transactionsHasMore = transactions.hasMore;
      previousButton.disabled = transactionPage <= 1;
      nextButton.disabled = !transactionsHasMore;
      pageLabel.textContent = `Trang ${transactionPage}`;
      const balance = BigInt(wallet.balanceDong);
      mount(walletDetails,
        h('section', { class: 'card', style: 'padding:18px;display:grid;gap:8px' },
          h('h2', { style: 'margin:0;font-size:18px' }, `${selectedDriver.name} · #${selectedDriver.driverId}`),
          h('span', { class: 'muted' }, selectedDriver.email),
          h('strong', { style: 'font-size:28px;color:var(--brand-primary)' }, formatDong(wallet.balanceDong)),
          wallet.inDebt ? h('p', { class: 'badge badge--warning' }, `Đang nợ ${formatDong(-balance)}.`) : null,
          wallet.locked ? h('p', { class: 'badge badge--danger' }, 'Ví đang bị khóa để kiểm tra.') : null,
          h('span', { class: 'muted' }, `Ngưỡng bắt đầu sạc: ${formatDong(wallet.minBalanceDong)}`)
        ),
        h('section', { style: 'display:grid;gap:10px' },
          h('h2', { style: 'margin:8px 0 0' }, 'Sổ cái'),
          ...(transactions.items.length
            ? transactions.items.map(transactionCard)
            : [h('div', { class: 'card', style: 'padding:16px' }, emptyState({ title: 'Chưa có giao dịch ví' }))])
        ),
        h('section', {
          style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px',
          'aria-label': 'Thao tác quản trị ví',
        }, topupForm, adjustmentForm, unlockForm)
      );
      status.textContent = '';
    } catch (error) {
      if (!disposed) mount(walletDetails, errorState({ message: error.message, onRetry: () => { void loadWallet(); } }));
    } finally {
      loadingWallet = false;
    }
  }

  async function submitOperation(operation, body, successMessage) {
    if (!selectedDriver || disposed) return;
    status.textContent = '';
    try {
      await api(`/api/admin/wallets/${encodeURIComponent(selectedDriver.driverId)}/${operation}`, {
        method: 'POST',
        body,
      });
      await searchDrivers();
      await loadWallet();
      status.textContent = successMessage;
    } catch (error) {
      status.textContent = error.message;
    }
  }

  if (searchInput.value.trim()) void searchDrivers();
  return () => { disposed = true; };
}
