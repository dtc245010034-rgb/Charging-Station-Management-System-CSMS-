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
  const topupRef = ctx.params.query.topup;
  const content = h('div', { style: 'display:grid;gap:12px' }, loadingState(3));
  const topupTracker = h('div', { style: 'display:grid;gap:8px' });
  const formFeedback = h('div', { style: 'display:grid;gap:8px' });
  let pollTimer = null;
  let pollCount = 0;
  const MAX_POLLS = 100; // 100 * 3s = 300s = 5 phút

  function onFeedback(message, tone = 'fault') {
    mount(formFeedback, h('p', { class: `badge badge--${tone}`, role: tone === 'fault' ? 'alert' : 'status' }, message));
  }

  function topupSection() {
    const amountInput = h('input', {
      class: 'input',
      type: 'number',
      min: 10000,
      max: 5000000,
      step: 10000,
      placeholder: 'Số tiền (10.000 - 5.000.000 đ)',
      value: 100000,
      style: 'max-width:260px',
    });
    const submitButton = h('button', {
      class: 'btn btn--primary',
      type: 'submit',
    }, 'Nạp tiền vào ví');

    const presetAmounts = [50000, 100000, 200000, 500000];
    const presetButtons = presetAmounts.map((amt) => h('button', {
      class: 'btn btn--ghost',
      type: 'button',
      onclick: () => { amountInput.value = amt; },
    }, formatDong(amt)));

    return h('form', {
      class: 'card',
      style: 'padding:16px;display:grid;gap:12px',
      onsubmit: async (e) => {
        e.preventDefault();
        const amount = Number(amountInput.value);
        if (!Number.isInteger(amount) || amount < 10000 || amount > 5000000) {
          onFeedback('Số tiền nạp phải là số nguyên từ 10.000 đ đến 5.000.000 đ', 'fault');
          return;
        }
        submitButton.disabled = true;
        submitButton.textContent = 'Đang chuyển tới cổng...';
        mount(formFeedback);
        try {
          const idempotencyKey = `topup-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const res = await api('/api/me/wallet/topups', {
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
            body: { amountDong: amount },
          });
          if (res.redirectUrl) {
            window.location.href = res.redirectUrl;
          } else {
            onFeedback('Đã tạo đơn nạp tiền thành công', 'ready');
            submitButton.disabled = false;
            submitButton.textContent = 'Nạp tiền vào ví';
          }
        } catch (err) {
          submitButton.disabled = false;
          submitButton.textContent = 'Nạp tiền vào ví';
          onFeedback(err.message || 'Lỗi khi tạo yêu cầu nạp tiền', 'fault');
        }
      },
    },
    h('h3', { style: 'margin:0;font-size:16px' }, 'Nạp tiền qua cổng thanh toán'),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' },
      h('span', { class: 'muted' }, 'Chọn nhanh:'),
      ...presetButtons
    ),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' },
      amountInput,
      submitButton
    ),
    formFeedback);
  }

  async function checkTopupStatus() {
    if (disposed) return;
    try {
      const res = await api(`/api/me/wallet/topups/${encodeURIComponent(topupRef)}`);
      if (disposed) return;
      const { status, failureReason, amountDong } = res.topup;

      if (status === 'PENDING') {
        mount(topupTracker, h('div', { class: 'badge badge--warning', style: 'padding:12px;font-size:14px;display:flex;align-items:center;gap:8px' },
          `Đang chờ thanh toán đơn ${topupRef} (${formatDong(amountDong)})... Hệ thống tự động kiểm tra mỗi 3 giây.`
        ));
      } else if (status === 'SUCCESS') {
        if (pollTimer) clearInterval(pollTimer);
        mount(topupTracker, h('div', { class: 'badge badge--ready', style: 'padding:12px;font-size:14px' },
          `Nạp tiền thành công ${formatDong(amountDong)}! Số dư đã được cập nhật.`
        ));
        void loadPage();
      } else if (status === 'FAILED') {
        if (pollTimer) clearInterval(pollTimer);
        mount(topupTracker, h('div', { class: 'badge badge--fault', style: 'padding:12px;font-size:14px' },
          `Giao dịch nạp tiền thất bại: ${failureReason || 'Lỗi thanh toán từ cổng'}`
        ));
      } else if (status === 'CANCELLED') {
        if (pollTimer) clearInterval(pollTimer);
        mount(topupTracker, h('div', { class: 'badge badge--warning', style: 'padding:12px;font-size:14px' },
          'Giao dịch nạp tiền đã bị hủy.'
        ));
      } else if (status === 'EXPIRED') {
        if (pollTimer) clearInterval(pollTimer);
        mount(topupTracker, h('div', { class: 'badge badge--fault', style: 'padding:12px;font-size:14px' },
          'Giao dịch nạp tiền đã hết hạn (quá 30 phút).'
        ));
      }
    } catch (err) {
      if (pollTimer) clearInterval(pollTimer);
      mount(topupTracker, h('div', { class: 'badge badge--fault', style: 'padding:12px;font-size:14px' },
        `Không thể kiểm tra trạng thái đơn nạp: ${err.message}`
      ));
    }
  }

  if (topupRef) {
    void checkTopupStatus();
    pollTimer = setInterval(() => {
      pollCount += 1;
      if (pollCount >= MAX_POLLS) {
        if (pollTimer) clearInterval(pollTimer);
        mount(topupTracker, h('div', { class: 'badge badge--warning', style: 'padding:12px;font-size:14px' },
          'Hết thời gian chờ phản hồi tự động (5 phút). Bạn có thể kiểm tra lại sau.'
        ));
        return;
      }
      void checkTopupStatus();
    }, 3000);
  }

  function subscriptionSection(wallet) {
    const sectionContainer = h('section', { class: 'card', style: 'padding:20px;display:grid;gap:12px' });
    const sectionFeedback = h('div', { style: 'display:grid;gap:8px' });

    async function loadPlans() {
      try {
        const [plansRes, activeSubRes] = await Promise.all([
          api('/api/subscription-plans'),
          api('/api/me/subscriptions'),
        ]);
        if (disposed) return;

        const activeSub = activeSubRes.activeSubscription;
        const plans = plansRes.plans || [];

        const subCard = activeSub
          ? h('div', { class: 'card', style: 'padding:14px;background:var(--surface-sunken, #f8fafc);display:grid;gap:6px' },
              h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap' },
                h('strong', { style: 'color:var(--brand-primary)' }, `Gói đang dùng: ${activeSub.planName || activeSub.planCode}`),
                h('span', { class: 'badge badge--success' }, 'Đang hiệu lực')
              ),
              h('span', { class: 'muted' }, `Thời hạn: ${formatDateTime(activeSub.startsAt)} – ${formatDateTime(activeSub.endsAt)}`),
              h('span', { class: 'muted' }, `Giá gói: ${formatDong(activeSub.priceDong)}`)
            )
          : h('div', { class: 'muted' }, 'Bạn chưa đăng ký gói thuê bao nào.');

        const planCards = plans.map((plan) => {
          const buyButton = h('button', {
            class: 'btn btn--primary',
            type: 'button',
            disabled: !!activeSub,
            onclick: async () => {
              if (activeSub) return;
              if (BigInt(wallet.balanceDong) < BigInt(plan.priceDong)) {
                mount(sectionFeedback, h('p', { class: 'badge badge--fault' }, 'Số dư ví không đủ để mua gói này. Vui lòng nạp thêm tiền!'));
                return;
              }
              buyButton.disabled = true;
              buyButton.textContent = 'Đang xử lý...';
              mount(sectionFeedback);
              try {
                const idempotencyKey = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                await api('/api/me/subscriptions', {
                  method: 'POST',
                  headers: { 'Idempotency-Key': idempotencyKey },
                  body: { planId: plan.id },
                });
                mount(sectionFeedback, h('p', { class: 'badge badge--success' }, 'Mua gói thuê bao thành công!'));
                void loadPage();
              } catch (err) {
                buyButton.disabled = false;
                buyButton.textContent = 'Mua gói';
                mount(sectionFeedback, h('p', { class: 'badge badge--fault' }, err.message || 'Lỗi khi mua gói'));
              }
            },
          }, activeSub ? 'Đã có gói' : 'Mua gói');

          const periodDescriptions = (plan.periods || []).map((p) =>
            `${Math.floor(p.startMinute / 60).toString().padStart(2, '0')}:${(p.startMinute % 60).toString().padStart(2, '0')} - ${Math.floor(p.endMinute / 60).toString().padStart(2, '0')}:${(p.endMinute % 60).toString().padStart(2, '0')}: ${formatDong(p.pricePerKwhDong)}/kWh`
          ).join(', ');

          return h('div', { class: 'card', style: 'padding:14px;display:grid;gap:8px' },
            h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap' },
              h('strong', {}, plan.name),
              h('strong', { style: 'color:var(--brand-primary);font-size:18px' }, formatDong(plan.priceDong))
            ),
            h('span', { class: 'muted' }, `Thời hạn: ${plan.durationDays} ngày`),
            periodDescriptions ? h('span', { class: 'muted' }, `Biểu giá: ${periodDescriptions}`) : null,
            buyButton
          );
        });

        mount(sectionContainer,
          h('h3', { style: 'margin:0;font-size:18px' }, 'Gói thuê bao tháng'),
          subCard,
          planCards.length ? h('div', { style: 'display:grid;gap:10px' }, ...planCards) : null,
          sectionFeedback
        );
      } catch (err) {
        mount(sectionContainer,
          h('h3', { style: 'margin:0;font-size:18px' }, 'Gói thuê bao tháng'),
          h('div', { class: 'muted' }, `Không thể tải danh sách gói: ${err.message}`)
        );
      }
    }

    void loadPlans();
    return sectionContainer;
  }

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
  const subscriptionSlot = h('div');

  ctx.root.replaceChildren(
    h('header', {}, h('p', { class: 'eyebrow' }, 'Tài xế'), h('h1', { class: 'page-head__title' }, 'Ví của tôi')),
    topupTracker,
    topupSection(),
    subscriptionSlot,
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
      mount(subscriptionSlot, subscriptionSection(wallet));
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
  return () => {
    disposed = true;
    if (pollTimer) clearInterval(pollTimer);
  };
}
