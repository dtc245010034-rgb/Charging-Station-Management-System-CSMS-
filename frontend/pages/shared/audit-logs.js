import { h, mount } from '../../app/dom.js';
import { formatDateTime } from '../../app/format.js';
import { api } from '../../services/api.js';
import { dataTable } from '../../components/table.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { statusBadge } from '../../components/badge.js';

const PAGE_SIZE = 50;
const ACTION_LABELS = {
  ACCESS_DENIED: 'Truy cập bị từ chối',
  CREATE: 'Tạo mới',
  DATA_ERASURE_COMPLETED: 'Ẩn danh hóa dữ liệu',
  DATA_ERASURE_REJECTED: 'Từ chối yêu cầu xóa dữ liệu',
  DATA_ERASURE_REQUESTED: 'Yêu cầu ẩn danh hóa dữ liệu',
  LOCK: 'Khoá trạm',
  REMOTE_START: 'Bắt đầu sạc từ xa',
  REMOTE_STOP: 'Dừng sạc từ xa',
  RESET: 'Khởi động lại trụ',
  SESSION_MANUALLY_CLOSED: 'Đóng phiên bất thường',
  TARIFF_CREATED: 'Khai báo biểu giá',
  UNLOCK: 'Mở khoá trạm',
  UPDATE: 'Cập nhật',
  WALLET_ADJUST: 'Điều chỉnh ví',
  WALLET_MISMATCH: 'Phát hiện lệch sổ cái ví',
  WALLET_TOPUP_GATEWAY: 'Nạp ví qua cổng thanh toán',
  WALLET_TOPUP_MANUAL: 'Nạp tiền vào ví',
  WALLET_UNLOCK: 'Mở khóa ví',
  PERIOD_CLOSED: 'Chốt kỳ kế toán',
  PERIOD_REOPENED: 'Mở lại kỳ kế toán',
  BILLING_PERIOD_CLOSED: 'Không lập hóa đơn do kỳ đã chốt',
  WEBHOOK_AMOUNT_MISMATCH: 'Lệch số tiền webhook',
  WEBHOOK_BAD_SIGNATURE: 'Chữ ký webhook không hợp lệ',
};
const RESULT_PRESENTATION = {
  ACCEPTED: { label: 'Đã chấp nhận', tone: 'ready' },
  STARTED: { label: 'Đã bắt đầu', tone: 'charging' },
  STOPPED: { label: 'Đã dừng', tone: 'ready' },
  COMPLETED: { label: 'Đã hoàn tất', tone: 'ready' },
  REJECTED: { label: 'Bị từ chối', tone: 'warning' },
  CHARGE_POINT_OFFLINE: { label: 'Trụ ngoại tuyến', tone: 'offline' },
  CHARGE_POINT_REJECTED: { label: 'Trụ từ chối', tone: 'warning' },
  OFFLINE: { label: 'Ngoại tuyến', tone: 'offline' },
  ERROR: { label: 'Lỗi', tone: 'fault' },
  OCPP_CALL_TIMEOUT: { label: 'Hết thời gian chờ', tone: 'warning' },
  TIMED_OUT: { label: 'Hết thời gian', tone: 'warning' },
  RESULT_UNKNOWN: { label: 'Chưa rõ kết quả', tone: 'warning' },
};

export function auditActionLabel(action) {
  return ACTION_LABELS[action] ?? action ?? 'Không rõ';
}

export function auditResultLabel(result) {
  const key = typeof result === 'string' ? result.toUpperCase() : '';
  return RESULT_PRESENTATION[key]?.label ?? result ?? '—';
}

export function render(ctx) {
  let disposed = false;
  let loading = false;
  const initialQuery = ctx.params?.query ?? {};
  const initialPage = Number(initialQuery.page);
  let pageNumber = Number.isSafeInteger(initialPage) && initialPage > 0 ? initialPage : 1;
  let total = 0;
  const page = h('div', { class: 'page-stack audit-log-page' });
  const results = h('div', { class: 'audit-log-results' }, loadingState(2));
  const pagination = h('footer', { class: 'audit-pagination' });
  const chargePointInput = h('input', {
    class: 'input', name: 'charge_point', type: 'search', maxlength: 100, autocomplete: 'off',
    placeholder: 'Ví dụ: VCP-01', 'aria-label': 'Lọc theo mã trụ',
    value: initialQuery.charge_point ?? '',
  });
  const userInput = h('input', {
    class: 'input', name: 'user', type: 'search', maxlength: 200, autocomplete: 'off',
    placeholder: 'Tên, email hoặc mã người dùng', 'aria-label': 'Lọc theo người thực hiện',
    value: initialQuery.user ?? '',
  });
  const driverIdInput = h('input', {
    class: 'input', name: 'driver_id', type: 'search', maxlength: 16, inputmode: 'numeric', autocomplete: 'off',
    placeholder: 'Mã tài xế', 'aria-label': 'Lọc theo mã tài xế',
    value: initialQuery.driver_id ?? '',
  });
  const fromInput = h('input', { class: 'input', name: 'from', type: 'date', 'aria-label': 'Từ ngày', value: initialQuery.from ?? '' });
  const toInput = h('input', { class: 'input', name: 'to', type: 'date', 'aria-label': 'Đến ngày', value: initialQuery.to ?? '' });
  const table = dataTable({
    caption: 'Nhật ký thao tác điều khiển từ xa',
    rowId: (row) => row.id,
    columns: [
      { key: 'created_at', label: 'Thời điểm', render: (row) => formatDateTime(row.created_at) },
      { key: 'user_name', label: 'Người thực hiện', render: (row) => row.user_name ? `${row.user_name} (#${row.user_id})` : (row.user_id ? `Tài khoản #${row.user_id}` : 'Hệ thống') },
      {
        key: 'action',
        label: 'Hành động',
        render: (row) => h('span', { class: 'badge badge--brand badge--square', title: row.action }, auditActionLabel(row.action)),
      },
      {
        key: 'target',
        label: 'Đối tượng',
        render: (row) => h('span', {}, row.charge_point_code || row.metadata?.charge_point_code || `${row.entity || 'Đối tượng'} #${row.entity_id ?? '—'}`),
      },
      { key: 'ip', label: 'Địa chỉ IP', render: (row) => row.ip || '—' },
      {
        key: 'result',
        label: 'Kết quả',
        render: (row) => {
          const resultKey = typeof row.result === 'string' ? row.result.toUpperCase() : '';
          const presentation = RESULT_PRESENTATION[resultKey] ?? { label: auditResultLabel(row.result), tone: 'neutral' };
          return row.result
            ? statusBadge(row.result, row.result, presentation.tone, presentation.label)
            : '—';
        },
      },
      {
        key: 'metadata',
        label: 'Dữ liệu kèm',
        render: (row) => {
          const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
            ? row.metadata
            : {};
          return Object.keys(metadata).length
            ? h('details', {},
              h('summary', { style: 'cursor:pointer' }, 'Xem JSON'),
              h('pre', { style: 'max-width:360px;max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0' },
                JSON.stringify(metadata, null, 2))
            )
            : h('span', { class: 'muted' }, '—');
        },
      },
    ],
  });
  const previousButton = h('button', {
    class: 'btn', type: 'button', onclick: () => {
      pageNumber = Math.max(1, pageNumber - 1);
      syncUrl();
      void refresh();
    },
  }, 'Trang trước');
  const nextButton = h('button', {
    class: 'btn', type: 'button', onclick: () => {
      pageNumber += 1;
      syncUrl();
      void refresh();
    },
  }, 'Trang sau');
  const pageStatus = h('span', { class: 'muted', 'aria-live': 'polite' });

  const filterForm = h('form', {
    class: 'card audit-filter',
    onsubmit: (event) => {
      event.preventDefault();
      pageNumber = 1;
      syncUrl();
      void refresh();
    },
  },
  h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, 'Trụ sạc'), chargePointInput),
  h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, 'Người thực hiện'), userInput),
  h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, 'Mã tài xế'), driverIdInput),
  h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, 'Từ ngày'), fromInput),
  h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, 'Đến ngày'), toInput),
  h('div', { class: 'audit-filter__actions' },
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Lọc nhật ký'),
    h('button', {
      class: 'btn', type: 'button', onclick: () => {
        chargePointInput.value = '';
        userInput.value = '';
        driverIdInput.value = '';
        fromInput.value = '';
        toInput.value = '';
        pageNumber = 1;
        syncUrl();
        void refresh();
      },
    }, 'Xoá lọc')));

  const refreshButton = h('button', {
    class: 'btn page-refresh', type: 'button', onclick: () => { void refresh(); },
  }, icon('refresh'), 'Làm mới');
  page.append(
    h('header', { class: 'page-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Vận hành'),
        h('h1', { class: 'page-head__title' }, 'Nhật ký điều khiển'),
        h('p', { class: 'page-head__sub' }, 'Tra cứu thao tác theo trụ sạc, người thực hiện và khoảng thời gian.')
      ),
      refreshButton
    ),
    filterForm,
    results,
    pagination
  );
  ctx.root.replaceChildren(page);

  function syncUrl() {
    const params = new URLSearchParams({ page: String(pageNumber) });
    if (chargePointInput.value.trim()) params.set('charge_point', chargePointInput.value.trim());
    if (userInput.value.trim()) params.set('user', userInput.value.trim());
    if (driverIdInput.value.trim()) params.set('driver_id', driverIdInput.value.trim());
    if (fromInput.value) params.set('from', fromInput.value);
    if (toInput.value) params.set('to', toInput.value);
    const hash = `#/${ctx.workspace}/control-log?${params}`;
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  }

  function updatePagination() {
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    pageStatus.textContent = `Trang ${pageNumber} / ${pageCount} · ${total} dòng`;
    previousButton.disabled = loading || pageNumber <= 1;
    nextButton.disabled = loading || pageNumber >= pageCount;
    mount(pagination, previousButton, pageStatus, nextButton);
  }

  async function refresh() {
    if (loading || disposed || !ctx.can('audit-logs:read')) return;
    loading = true;
    refreshButton.disabled = true;
    updatePagination();
    const params = new URLSearchParams({ page: String(pageNumber) });
    if (chargePointInput.value.trim()) params.set('charge_point', chargePointInput.value.trim());
    if (userInput.value.trim()) params.set('user', userInput.value.trim());
    if (driverIdInput.value.trim()) params.set('driver_id', driverIdInput.value.trim());
    if (fromInput.value) params.set('from', fromInput.value);
    if (toInput.value) params.set('to', toInput.value);
    try {
      const response = await api(`/api/audit-logs?${params}`);
      if (disposed) return;
      total = response.total;
      mount(results, response.items.length
        ? table.el
        : h('section', { class: 'card', style: 'padding:24px' },
          emptyState({ iconName: 'log', title: 'Không tìm thấy nhật ký phù hợp' })
        ));
      if (response.items.length) table.update(response.items);
    } catch (error) {
      if (!disposed) {
        const message = error instanceof Error ? error.message : 'Không thể tải nhật ký.';
        mount(results, errorState({ message, onRetry: () => { void refresh(); } }));
      }
    } finally {
      loading = false;
      refreshButton.disabled = false;
      updatePagination();
    }
  }

  void refresh();
  return () => { disposed = true; };
}
