import { h, mount } from '../../app/dom.js';
import { formatDateTime } from '../../app/format.js';
import { api } from '../../services/api.js';
import { dataTable } from '../../components/table.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';

const PAGE_SIZE = 50;

export function render(ctx) {
  let disposed = false;
  let loading = false;
  let pageNumber = 1;
  let total = 0;
  const page = h('div', { class: 'page-stack', style: 'max-width:1200px;margin:0 auto' });
  const notice = h('div', { class: 'card', role: 'status', 'aria-live': 'polite', style: 'display:none;padding:12px 16px' });
  const results = h('div', { style: 'display:grid;gap:12px' }, loadingState(2));
  const pagination = h('footer', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' });
  const chargePointInput = h('input', {
    class: 'input', name: 'charge_point', type: 'search', maxlength: 100, autocomplete: 'off',
    placeholder: 'Ví dụ: VCP-01', 'aria-label': 'Lọc theo mã trụ',
  });
  const userInput = h('input', {
    class: 'input', name: 'user', type: 'search', maxlength: 200, autocomplete: 'off',
    placeholder: 'Tên, email hoặc mã người dùng', 'aria-label': 'Lọc theo người thực hiện',
  });
  const fromInput = h('input', { class: 'input', name: 'from', type: 'date', 'aria-label': 'Từ ngày' });
  const toInput = h('input', { class: 'input', name: 'to', type: 'date', 'aria-label': 'Đến ngày' });
  const table = dataTable({
    caption: 'Nhật ký thao tác điều khiển từ xa',
    rowId: (row) => row.id,
    columns: [
      { key: 'created_at', label: 'Thời điểm', render: (row) => formatDateTime(row.created_at) },
      { key: 'user_name', label: 'Người thực hiện', render: (row) => row.user_name ? `${row.user_name} (#${row.user_id})` : (row.user_id ? `Tài khoản #${row.user_id}` : 'Hệ thống') },
      { key: 'action', label: 'Hành động', render: (row) => row.action },
      {
        key: 'target',
        label: 'Đối tượng',
        render: (row) => h('span', {}, row.charge_point_code || `${row.entity || 'Đối tượng'} #${row.entity_id ?? '—'}`),
      },
      { key: 'result', label: 'Kết quả', render: (row) => row.result || '—' },
      {
        key: 'metadata',
        label: 'Dữ liệu kèm',
        render: (row) => h('details', {},
          h('summary', { style: 'cursor:pointer' }, 'Xem JSON'),
          h('pre', { style: 'max-width:360px;max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0' },
            JSON.stringify(row.metadata ?? {}, null, 2))
        ),
      },
    ],
  });
  const previousButton = h('button', {
    class: 'btn', type: 'button', onclick: () => { pageNumber -= 1; void refresh(); },
  }, 'Trang trước');
  const nextButton = h('button', {
    class: 'btn', type: 'button', onclick: () => { pageNumber += 1; void refresh(); },
  }, 'Trang sau');
  const pageStatus = h('span', { class: 'muted', 'aria-live': 'polite' });

  const filterForm = h('form', {
    class: 'card',
    style: 'padding:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;align-items:end',
    onsubmit: (event) => {
      event.preventDefault();
      pageNumber = 1;
      void refresh();
    },
  },
  h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, 'Trụ sạc'), chargePointInput),
  h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, 'Người thực hiện'), userInput),
  h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, 'Từ ngày'), fromInput),
  h('label', { style: 'display:grid;gap:5px' }, h('span', { class: 'muted' }, 'Đến ngày'), toInput),
  h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Lọc nhật ký'),
    h('button', {
      class: 'btn', type: 'button', onclick: () => {
        chargePointInput.value = '';
        userInput.value = '';
        fromInput.value = '';
        toInput.value = '';
        pageNumber = 1;
        void refresh();
      },
    }, 'Xoá lọc')));

  const refreshButton = h('button', {
    class: 'btn', type: 'button', onclick: () => { void refresh(); },
  }, icon('refresh'), 'Làm mới');
  page.append(
    h('header', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Vận hành'),
        h('h1', { class: 'page-head__title' }, 'Nhật ký điều khiển'),
        h('p', { class: 'muted' }, 'Tra cứu thao tác theo trụ sạc, người thực hiện và khoảng thời gian.')
      ),
      refreshButton
    ),
    filterForm,
    notice,
    results,
    pagination
  );
  ctx.root.replaceChildren(page);

  function showError(message) {
    notice.setAttribute('role', 'alert');
    notice.dataset.kind = 'error';
    mount(notice, message);
    notice.style.display = 'block';
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
      notice.style.display = 'none';
    } catch (error) {
      if (!disposed) {
        mount(results, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
        showError(error.message || 'Không thể tải nhật ký.');
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
