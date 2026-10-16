import { h, mount } from '../../app/dom.js';
import { formatNumber } from '../../app/format.js';
import { api } from '../../services/api.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';

const money = new Intl.NumberFormat('vi-VN');

function monthRange(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, date.getMonth() + 1, 0).getDate();
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(lastDay).padStart(2, '0')}` };
}

function amount(value) {
  return `${money.format(BigInt(value))} đ`;
}

function kwh(value) {
  const wh = BigInt(value);
  return `${money.format(wh / 1000n)},${(wh % 1000n).toString().padStart(3, '0')} kWh`;
}

export function render(ctx) {
  const period = monthRange();
  const from = h('input', { class: 'input', type: 'date', name: 'from', required: true, value: period.from });
  const to = h('input', { class: 'input', type: 'date', name: 'to', required: true, value: period.to });
  const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Xem doanh thu');
  const body = h('div', { class: 'card__body' }, loadingState(4));
  const form = h('form', { class: 'toolbar', onsubmit: async (event) => {
    event.preventDefault();
    await refresh();
  } },
  h('label', { class: 'field' }, h('span', {}, 'Từ ngày'), from),
  h('label', { class: 'field' }, h('span', {}, 'Đến ngày'), to),
  submit);

  ctx.root.replaceChildren(
    h('div', { class: 'page-stack' },
      h('header', { class: 'page-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, 'Báo cáo'), h('h1', { class: 'page-head__title' }, 'Doanh thu')),
      ),
      h('section', { class: 'card' }, h('div', { class: 'card__body' }, form)),
      h('section', { class: 'card', 'aria-label': 'Báo cáo doanh thu' }, body)
    )
  );

  async function refresh() {
    if (!from.value || !to.value || from.value > to.value) {
      from.setCustomValidity('Khoảng ngày không hợp lệ.');
      from.reportValidity();
      return;
    }
    from.setCustomValidity('');
    submit.disabled = true;
    mount(body, loadingState(4));
    try {
      const query = new URLSearchParams({ from: from.value, to: to.value });
      const report = await api(`/api/reports/revenue?${query}`);
      if (!report.rows.length) {
        mount(body, emptyState({ iconName: 'activity', title: 'Không có doanh thu trong kỳ đã chọn' }));
        return;
      }
      const rows = report.rows.map((row) => h('tr', {},
        h('td', {}, row.stationName),
        h('td', {}, row.chargePointCode),
        h('td', {}, formatNumber(row.connectorNo)),
        h('td', {}, formatNumber(row.sessions)),
        h('td', {}, kwh(row.totalWh)),
        h('td', {}, amount(row.energyDong)),
        h('td', {}, amount(row.idleDong)),
        h('td', {}, amount(row.totalDong))
      ));
      rows.push(h('tr', { class: 'table__total' },
        h('th', { colspan: '3', scope: 'row' }, 'Tổng'),
        h('td', {}, formatNumber(report.total.sessions)),
        h('td', {}, kwh(report.total.totalWh)),
        h('td', {}, amount(report.total.energyDong)),
        h('td', {}, amount(report.total.idleDong)),
        h('td', {}, amount(report.total.totalDong))
      ));
      mount(body, h('div', { class: 'table-wrap' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            ['Trạm', 'Trụ sạc', 'Đầu nối', 'Phiên', 'Điện năng', 'Tiền điện', 'Phí chiếm trụ', 'Tổng tiền'].map((label) => h('th', { scope: 'col' }, label))
          )),
          h('tbody', {}, rows)
        )
      ));
    } catch (error) {
      mount(body, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
    } finally {
      submit.disabled = false;
    }
  }

  void refresh();
}
