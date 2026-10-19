import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';

const STATUS_LABELS = {
  REQUESTED: 'Chờ xử lý',
  APPROVED: 'Đang xử lý',
  REJECTED: 'Đã từ chối',
  COMPLETED: 'Đã hoàn tất',
};

export function render(ctx) {
  const notice = h('p', { role: 'status', 'aria-live': 'polite' });
  const results = h('div', { class: 'card__body' }, loadingState(3));
  ctx.root.replaceChildren(
    h('div', { class: 'page-stack' },
      h('header', { class: 'page-head' }, h('div', {},
        h('p', { class: 'eyebrow' }, 'Quản trị'),
        h('h1', { class: 'page-head__title' }, 'Yêu cầu xóa dữ liệu cá nhân')
      )),
      notice,
      h('section', { class: 'card', 'aria-label': 'Yêu cầu ẩn danh hóa' }, results)
    )
  );

  async function decide(id, action) {
    try {
      if (action === 'reject') {
        const reason = window.prompt('Lý do từ chối (tối thiểu 10 ký tự):');
        if (reason === null) return;
        await api(`/api/admin/erasure-requests/${id}/reject`, { method: 'POST', body: { reason } });
      } else {
        await api(`/api/admin/erasure-requests/${id}/approve`, { method: 'POST', body: {} });
      }
      notice.textContent = 'Đã cập nhật yêu cầu.';
      await refresh();
    } catch (error) {
      notice.textContent = error.message;
    }
  }

  async function refresh() {
    mount(results, loadingState(3));
    try {
      const { requests } = await api('/api/admin/erasure-requests');
      if (!requests.length) {
        mount(results, emptyState({ iconName: 'user', title: 'Không có yêu cầu ẩn danh hóa' }));
        return;
      }
      mount(results, h('div', { class: 'table-wrap' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            ['Mã yêu cầu', 'Trạng thái', 'Thời điểm yêu cầu', 'Thao tác'].map((label) => h('th', { scope: 'col' }, label))
          )),
          h('tbody', {}, requests.map((item) => h('tr', {},
            h('td', {}, `#${item.id}`),
            h('td', {}, STATUS_LABELS[item.status] || item.status),
            h('td', {}, item.requested_at),
            h('td', {}, item.status === 'REQUESTED' ? h('div', { class: 'toolbar' },
              h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { void decide(item.id, 'approve'); } }, 'Duyệt'),
              h('button', { class: 'btn', type: 'button', onclick: () => { void decide(item.id, 'reject'); } }, 'Từ chối')
            ) : '—')
          )))
        )
      ));
    } catch (error) {
      mount(results, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
    }
  }
  void refresh();
}
