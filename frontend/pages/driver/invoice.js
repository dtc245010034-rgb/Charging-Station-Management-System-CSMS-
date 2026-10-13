import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { formatDateTime, formatNumber } from '../../app/format.js';

const BILLING_LABELS = {
  PENDING: 'Đang chờ lập hóa đơn',
  ERROR: 'Chưa thể lập hóa đơn',
  REVIEW: 'Hóa đơn cần được kiểm tra',
  WAITING_IDLE: 'Đang chờ xác nhận rút súng sạc',
  FINAL: 'Hóa đơn đã chốt',
  SKIPPED: 'Phiên này không có hóa đơn',
};

function formatLine(line) {
  if (line.kind === 'IDLE') {
    return `${line.minutes} phút chiếm trụ × ${formatNumber(line.perMinDong)} đ/phút`;
  }
  return `${formatNumber(Number(line.wh) / 1000)} kWh × ${formatNumber(line.pricePerKwh)} đ/kWh`;
}

export function render(ctx) {
  const sessionId = Number(ctx.params.id);
  const page = h('div', { class: 'page-stack', style: 'max-width:720px;margin:0 auto' });
  const content = h('div', {}, loadingState(2));
  page.append(
    h('header', {}, h('p', { class: 'eyebrow' }, 'Tài xế'), h('h1', { class: 'page-head__title' }, 'Hóa đơn phiên sạc')),
    content
  );
  ctx.root.replaceChildren(page);

  async function refresh() {
    if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
      mount(content, errorState({ message: 'Mã phiên sạc không hợp lệ.' }));
      return;
    }
    mount(content, loadingState(2));
    try {
      const result = await api(`/api/sessions/${sessionId}/invoice`);
      if (!result.invoice) {
        mount(content, emptyState({
          iconName: 'bolt',
          title: BILLING_LABELS[result.billingStatus] || 'Hóa đơn chưa sẵn sàng',
          text: result.billingReason || 'Vui lòng thử làm mới sau.',
          action: h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { void refresh(); } }, 'Làm mới'),
        }));
        return;
      }

      const invoice = result.invoice;
      mount(content,
        h('section', { class: 'card', style: 'padding:20px;display:grid;gap:14px' },
          h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap' },
            h('strong', {}, `Hóa đơn #${invoice.id}`),
            h('span', { class: 'muted' }, `Phát hành ${formatDateTime(invoice.issuedAt)}`)
          ),
          h('div', { style: 'font-size:28px;font-weight:800;color:var(--brand-primary)' }, `${formatNumber(invoice.totalDong)} đ`),
          h('div', { class: 'muted' }, `Phiên #${result.sessionId} · ${invoice.periodDate} · ${invoice.timezone}`),
          h('div', { style: 'display:grid;gap:10px' },
            ...invoice.lines.map((line) => h('article', { class: 'card', style: 'padding:12px;display:grid;gap:5px' },
              h('div', { style: 'display:flex;justify-content:space-between;gap:12px' },
                h('strong', {}, line.kind === 'IDLE' ? 'Phí chiếm trụ' : 'Phí năng lượng'),
                h('strong', {}, `${formatNumber(line.amountDong)} đ`)
              ),
              h('span', { class: 'muted' }, formatLine(line)),
              h('span', { class: 'muted' }, `${formatDateTime(line.from)} – ${formatDateTime(line.to)}`)
            ))
          ),
          h('p', { class: 'muted', style: 'margin:0' }, `Quy tắc làm tròn: ${invoice.roundingRule}`)
        ),
        h('a', { class: 'btn', href: '#/driver/history' }, 'Quay lại lịch sử')
      );
    } catch (error) {
      mount(content, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
    }
  }

  void refresh();
}
