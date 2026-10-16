import { h, mount } from '../../app/dom.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function render(ctx) {
  const month = h('input', { class: 'input', type: 'month', name: 'month', required: true, value: currentMonth() });
  const closeButton = h('button', { class: 'btn btn--primary', type: 'submit', disabled: !ctx.can('periods:manage') }, 'Chốt kỳ');
  const notice = h('p', { role: 'status', 'aria-live': 'polite' });
  const content = h('div', { class: 'card__body' }, loadingState(3));
  const form = h('form', { class: 'toolbar', onsubmit: async (event) => {
    event.preventDefault();
    if (!month.value) {
      month.setCustomValidity('Vui lòng chọn kỳ.');
      month.reportValidity();
      return;
    }
    month.setCustomValidity('');
    try {
      const period = await api(`/api/accounting/periods/${month.value}/close`, { method: 'POST', body: {} });
      notice.textContent = `Đã chốt kỳ ${period.month}.`;
      await refresh();
    } catch (error) {
      const blockers = error.details?.map((session) => `#${session.id}`).join(', ');
      notice.textContent = blockers ? `${error.message}: ${blockers}` : error.message;
    }
  } },
  h('label', { class: 'field' }, h('span', {}, 'Tháng cần chốt'), month),
  closeButton);
  ctx.root.replaceChildren(
    h('div', { class: 'page-stack' },
      h('header', { class: 'page-head' }, h('div', {},
        h('p', { class: 'eyebrow' }, 'Kế toán'),
        h('h1', { class: 'page-head__title' }, 'Kỳ đối soát')
      )),
      h('section', { class: 'card' }, h('div', { class: 'card__body stack' }, form, notice)),
      h('section', { class: 'card', 'aria-label': 'Danh sách kỳ kế toán' }, content)
    )
  );

  async function refresh() {
    mount(content, loadingState(3));
    try {
      const { periods } = await api('/api/accounting/periods');
      if (!periods.length) {
        mount(content, emptyState({ iconName: 'calendar', title: 'Chưa có kỳ kế toán nào được chốt' }));
        return;
      }
      mount(content, h('div', { class: 'table-wrap' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            ['Tháng', 'Trạng thái', 'Thời điểm chốt', 'Thời điểm mở lại', 'Thao tác'].map((label) => h('th', { scope: 'col' }, label))
          )),
          h('tbody', {}, periods.map((period) => h('tr', {},
            h('td', {}, period.month.slice(0, 7)),
            h('td', {}, period.status === 'CLOSED' ? 'Đã chốt' : 'Đang mở'),
            h('td', {}, period.closed_at || '—'),
            h('td', {}, period.reopened_at || '—'),
            h('td', {}, period.status === 'CLOSED' && ctx.can('periods:reopen')
              ? h('button', {
                class: 'btn',
                type: 'button',
                onclick: async () => {
                  const reason = window.prompt('Lý do mở lại kỳ (tối thiểu 10 ký tự):');
                  if (reason === null) return;
                  try {
                    await api(`/api/accounting/periods/${period.month.slice(0, 7)}/reopen`, { method: 'POST', body: { reason } });
                    notice.textContent = `Đã mở lại kỳ ${period.month}.`;
                    await refresh();
                  } catch (error) {
                    notice.textContent = error.message;
                  }
                },
              }, 'Mở lại kỳ')
              : '—')
          )))
        )
      ));
    } catch (error) {
      mount(content, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
    }
  }
  void refresh();
}
