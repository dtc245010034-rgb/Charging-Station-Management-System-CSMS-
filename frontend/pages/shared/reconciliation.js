import { h, mount } from '../../app/dom.js';
import { formatNumber } from '../../app/format.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';

const money = new Intl.NumberFormat('vi-VN');
const integer = new Intl.NumberFormat('vi-VN');

function amount(value) {
  return value === null ? '—' : `${money.format(BigInt(value))} đ`;
}

function exactInteger(value) {
  return integer.format(BigInt(value));
}

function monthRange(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, date.getMonth() + 1, 0).getDate();
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(lastDay).padStart(2, '0')}` };
}

export function render(ctx) {
  const period = monthRange();
  const from = h('input', { class: 'input', type: 'date', name: 'from', value: period.from, required: true });
  const to = h('input', { class: 'input', type: 'date', name: 'to', value: period.to, required: true });
  const delimiter = h('select', { class: 'select', name: 'delimiter', value: 'semicolon' },
    h('option', { value: 'semicolon' }, 'Dấu chấm phẩy (;)'),
    h('option', { value: 'comma' }, 'Dấu phẩy (,)'));
  const csvLink = h('a', { class: 'btn btn--secondary', download: true }, 'Tải CSV');
  const button = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Đối soát');
  const content = h('div', { class: 'card__body' }, loadingState(5));
  const updateCsvLink = () => {
    const query = new URLSearchParams({ from: from.value, to: to.value, delimiter: delimiter.value });
    csvLink.setAttribute('href', `/api/reports/reconciliation.csv?${query}`);
  };
  for (const input of [from, to, delimiter]) input.addEventListener('change', updateCsvLink);
  updateCsvLink();
  const form = h('form', { class: 'toolbar', onsubmit: async (event) => {
    event.preventDefault();
    await refresh();
  } },
  h('label', { class: 'field' }, h('span', {}, 'Từ ngày'), from),
  h('label', { class: 'field' }, h('span', {}, 'Đến ngày'), to),
  h('label', { class: 'field' }, h('span', {}, 'Phân cách CSV'), delimiter),
  button, csvLink);
  ctx.root.replaceChildren(
    h('div', { class: 'page-stack' },
      h('header', { class: 'page-head' }, h('div', {},
        h('p', { class: 'eyebrow' }, 'Kế toán'),
        h('h1', { class: 'page-head__title' }, 'Đối soát')
      )),
      h('section', { class: 'card' }, h('div', { class: 'card__body' }, form)),
      h('section', { class: 'card', 'aria-label': 'Kết quả đối soát' }, content)
    )
  );

  async function refresh() {
    if (!from.value || !to.value || from.value > to.value) {
      from.setCustomValidity('Khoảng ngày không hợp lệ.');
      from.reportValidity();
      return;
    }
    from.setCustomValidity('');
    button.disabled = true;
    mount(content, loadingState(5));
    try {
      const query = new URLSearchParams({ from: from.value, to: to.value });
      const report = await api(`/api/reports/reconciliation?${query}`);
      const summary = h('section', { class: 'grid grid--4', 'aria-label': 'Tóm tắt đối soát' },
        h('article', { class: 'card' }, h('div', { class: 'card__body' },
          h('div', { class: 'muted' }, 'Phiên đã kiểm tra'),
          h('strong', { class: 'cell-strong' }, formatNumber(report.summary.sessionsChecked))
        )),
        h('article', { class: 'card' }, h('div', { class: 'card__body' },
          h('div', { class: 'muted' }, 'Phiên cần xem xét'),
          h('strong', { class: 'cell-strong' }, formatNumber(report.summary.issueCount))
        )),
        h('article', { class: 'card' }, h('div', { class: 'card__body' },
          h('div', { class: 'muted' }, 'Tổng chênh lệch'),
          h('strong', { class: 'cell-strong' }, amount(report.summary.totalDiffDong))
        )),
        h('article', { class: 'card' }, h('div', { class: 'card__body' },
          h('div', { class: 'muted' }, 'Điện đo / đã lập hóa đơn'),
          h('strong', { class: 'cell-strong' }, `${exactInteger(report.summary.whMeter)} / ${exactInteger(report.summary.whBilled)} Wh`)
        ))
      );
      if (!report.issues.length) {
        mount(content, summary, emptyState({ iconName: 'activity', title: 'Không có chênh lệch cần xử lý' }));
        return;
      }
      const rows = report.issues.map((issue) => h('tr', {},
        h('td', {}, `#${issue.sessionId}`),
        h('td', {}, issue.stationName),
        h('td', {}, `${issue.chargePointCode} · Cổng ${issue.connectorNo}`),
        h('td', {}, issue.type),
        h('td', {}, amount(issue.diffDong)),
        h('td', {}, issue.diffWh === null ? '—' : `${exactInteger(issue.diffWh)} Wh`),
        h('td', {}, issue.billingReason || issue.billingStatus || '—')
      ));
      mount(content, summary, h('div', { class: 'table-wrap' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            ['Phiên', 'Trạm', 'Đầu nối', 'Loại chênh lệch', 'Chênh lệch tiền', 'Chênh lệch điện', 'Trạng thái tính tiền'].map((label) => h('th', { scope: 'col' }, label))
          )),
          h('tbody', {}, rows)
        )
      ));
    } catch (error) {
      mount(content, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
    } finally {
      button.disabled = false;
    }
  }
  void refresh();
}
