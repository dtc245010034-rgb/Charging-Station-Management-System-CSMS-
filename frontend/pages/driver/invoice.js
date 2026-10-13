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

function lineCard(line) {
  return h('article', { class: 'card', style: 'padding:12px;display:grid;gap:5px' },
    h('div', { style: 'display:flex;justify-content:space-between;gap:12px' },
      h('strong', {}, line.kind === 'IDLE' ? 'Phí chiếm trụ' : 'Phí năng lượng'),
      h('strong', {}, `${formatNumber(line.amountDong)} đ`)
    ),
    h('span', { class: 'muted' }, formatLine(line)),
    h('span', { class: 'muted' }, `${formatDateTime(line.from)} – ${formatDateTime(line.to)}`)
  );
}

export function render(ctx) {
  let unmounted = false;
  let pollTimer = null;
  const sessionId = Number(ctx.params.id);
  const page = h('div', { class: 'page-stack', style: 'max-width:720px;margin:0 auto' });
  const content = h('div', {}, loadingState(2));
  page.append(
    h('header', {}, h('p', { class: 'eyebrow' }, 'Tài xế'), h('h1', { class: 'page-head__title' }, 'Hóa đơn phiên sạc')),
    content
  );
  ctx.root.replaceChildren(page);

  async function refresh() {
    if (unmounted) return;
    if (!Number.isSafeInteger(sessionId) || sessionId < 1) {
      mount(content, errorState({ message: 'Mã phiên sạc không hợp lệ.' }));
      return;
    }
    mount(content, loadingState(2));
    try {
      const result = await api(`/api/sessions/${sessionId}/invoice`);
      if (unmounted) return;

      const isFinal = result.status === 'FINAL' || result.billingStatus === 'FINAL';
      if (!isFinal || !result.invoice) {
        mount(content, emptyState({
          iconName: 'bolt',
          title: BILLING_LABELS[result.billingStatus || result.status] || 'Hóa đơn chưa sẵn sàng',
          text: result.message || result.billingReason || 'Đang chờ xử lý. Trang sẽ tự động làm mới sau 5 giây...',
          action: h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { void refresh(); } }, 'Làm mới ngay'),
        }));
        // Tự động hỏi lại sau 5 giây khi đang chờ
        clearTimeout(pollTimer);
        pollTimer = setTimeout(() => { void refresh(); }, 5000);
        return;
      }

      // Hóa đơn FINAL
      const invoice = result.invoice;
      const tariffVer = invoice.tariffSnapshot?.version ? `v${invoice.tariffSnapshot.version}` : 'v1';
      const tariffDate = invoice.tariffSnapshot?.effectiveFrom ? ` (hiệu lực từ ${invoice.tariffSnapshot.effectiveFrom})` : '';

      // Nhóm dòng theo ngày địa phương (localDate)
      const linesByDate = new Map();
      for (const line of invoice.lines || []) {
        const dateKey = line.localDate || invoice.periodDate || 'Chi tiết';
        if (!linesByDate.has(dateKey)) linesByDate.set(dateKey, []);
        linesByDate.get(dateKey).push(line);
      }

      const groupedSections = Array.from(linesByDate.entries()).map(([dateStr, dateLines]) => (
        h('section', { style: 'display:grid;gap:8px' },
          h('div', { class: 'eyebrow', style: 'margin-top:6px;font-weight:700' }, `Ngày ${dateStr}`),
          ...dateLines.map(lineCard)
        )
      ));

      mount(content,
        h('section', { class: 'card', style: 'padding:20px;display:grid;gap:14px' },
          h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap' },
            h('strong', {}, `Hóa đơn #${invoice.id}`),
            h('span', { class: 'muted' }, `Phát hành ${formatDateTime(invoice.issuedAt)}`)
          ),
          h('div', { style: 'font-size:28px;font-weight:800;color:var(--brand-primary)' }, `${formatNumber(invoice.totalDong)} đ`),
          h('div', { class: 'muted' }, `Phiên #${result.sessionId} · ${invoice.periodDate} · Múi giờ: ${invoice.timezone}`),
          h('div', { class: 'muted' }, `Biểu giá áp dụng: Phiên bản ${tariffVer}${tariffDate}`),
          h('div', { style: 'display:grid;gap:14px' }, ...groupedSections),
          h('p', { class: 'muted', style: 'margin:0' }, `Quy tắc làm tròn: ${invoice.roundingRule}`)
        ),
        h('a', { class: 'btn', href: '#/driver/history' }, 'Quay lại lịch sử')
      );
    } catch (error) {
      if (!unmounted) {
        mount(content, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
      }
    }
  }

  void refresh();
  return () => {
    unmounted = true;
    if (pollTimer) clearTimeout(pollTimer);
  };
}
