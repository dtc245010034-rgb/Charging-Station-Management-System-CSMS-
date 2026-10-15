import { h } from '../../app/dom.js';
import { formatNumber } from '../../app/format.js';
import * as csms from '../../services/csms.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';

function formatDong(amount) {
  return `${formatNumber(amount ?? 0)} đ`;
}

function formatKwh(wh) {
  return (Number(wh ?? 0) / 1000).toFixed(3);
}

function getDefaultMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return {
    from: firstDay.toISOString().slice(0, 10),
    to: lastDay.toISOString().slice(0, 10),
  };
}

export function render(ctx) {
  let disposed = false;
  const defaults = getDefaultMonthRange();
  let fromDate = ctx.query?.from || defaults.from;
  let toDate = ctx.query?.to || defaults.to;
  let selectedStationId = ctx.query?.stationId || '';

  const root = h('div', { class: 'page-stack', style: 'max-width:1100px;margin:0 auto;padding-bottom:40px' });
  ctx.root.replaceChildren(root);

  let stationsList = [];

  async function init() {
    try {
      stationsList = await csms.stations.list();
    } catch {
      stationsList = [];
    }
    loadData();
  }

  async function loadData() {
    if (disposed) return;
    root.replaceChildren(
      renderHeader(),
      loadingState(3)
    );

    try {
      const data = await csms.reports.revenue({
        from: fromDate,
        to: toDate,
        stationId: selectedStationId || undefined,
      });
      if (disposed) return;
      renderContent(data);
    } catch (err) {
      if (disposed) return;
      root.replaceChildren(
        renderHeader(),
        errorState({
          title: 'Không thể tải báo cáo doanh thu',
          text: err.message || 'Đã có lỗi xảy ra khi tải dữ liệu.',
          actionLabel: 'Thử lại',
          onAction: () => loadData(),
        })
      );
    }
  }

  function renderHeader() {
    const stationSelect = h('select', {
      class: 'input',
      style: 'width:auto',
      onchange: (e) => {
        selectedStationId = e.target.value;
        loadData();
      },
    },
    h('option', { value: '' }, 'Tất cả trạm sạc của tôi'),
    ...stationsList.map((st) => h('option', { value: String(st.id), selected: String(st.id) === String(selectedStationId) }, st.name))
    );

    const fromInput = h('input', {
      type: 'date',
      class: 'input',
      style: 'width:auto',
      value: fromDate,
      onchange: (e) => { fromDate = e.target.value; },
    });

    const toInput = h('input', {
      type: 'date',
      class: 'input',
      style: 'width:auto',
      value: toDate,
      onchange: (e) => { toDate = e.target.value; },
    });

    const applyBtn = h('button', {
      type: 'button',
      class: 'btn btn--primary',
      onclick: () => loadData(),
    }, icon('filter'), 'Xem báo cáo');

    return h('div', { class: 'page-head', style: 'display:flex;flex-direction:column;gap:16px' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Báo cáo'),
        h('h1', { class: 'page-head__title' }, 'Doanh thu & Sản lượng')
      ),
      h('div', { class: 'toolbar', style: 'display:flex;flex-wrap:wrap;gap:12px;align-items:center' },
        stationSelect,
        h('div', { style: 'display:flex;align-items:center;gap:6px' },
          h('span', { class: 'muted' }, 'Từ'),
          fromInput,
          h('span', { class: 'muted' }, 'Đến'),
          toInput
        ),
        applyBtn
      )
    );
  }

  function renderContent(data) {
    const { rows = [], summary = {} } = data;

    const summaryCards = h('div', {
      style: 'display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;margin-bottom:24px'
    },
    h('div', { class: 'card', style: 'padding:16px' },
      h('div', { class: 'cell-sub' }, 'Tổng số phiên'),
      h('div', { style: 'font-size:24px;font-weight:700;margin-top:4px' }, formatNumber(summary.sessions ?? 0))
    ),
    h('div', { class: 'card', style: 'padding:16px' },
      h('div', { class: 'cell-sub' }, 'Tổng sản lượng (kWh)'),
      h('div', { style: 'font-size:24px;font-weight:700;margin-top:4px' }, formatKwh(summary.totalWh ?? 0))
    ),
    h('div', { class: 'card', style: 'padding:16px' },
      h('div', { class: 'cell-sub' }, 'Tiền điện năng'),
      h('div', { style: 'font-size:24px;font-weight:700;margin-top:4px' }, formatDong(summary.energyDong ?? 0))
    ),
    h('div', { class: 'card', style: 'padding:16px' },
      h('div', { class: 'cell-sub' }, 'Phí chiếm trụ'),
      h('div', { style: 'font-size:24px;font-weight:700;margin-top:4px' }, formatDong(summary.idleDong ?? 0))
    ),
    h('div', { class: 'card', style: 'padding:16px' },
      h('div', { class: 'cell-sub' }, 'Tổng doanh thu'),
      h('div', { style: 'font-size:24px;font-weight:700;color:var(--color-primary-text, #10b981);margin-top:4px' }, formatDong(summary.totalDong ?? 0))
    )
    );

    let tableEl;
    if (rows.length === 0) {
      tableEl = emptyState({
        iconName: 'activity',
        title: 'Không có dữ liệu doanh thu',
        text: 'Chưa có phiên sạc nào có hoá đơn trong kỳ đã chọn.',
      });
    } else {
      const tbody = h('tbody', {},
        ...rows.map((row) => h('tr', {},
          h('td', { class: 'cell-strong' }, row.stationName),
          h('td', {}, row.chargePointCode),
          h('td', {}, `Đầu nối ${row.connectorNo}`),
          h('td', { style: 'text-align:right' }, formatNumber(row.sessions)),
          h('td', { style: 'text-align:right' }, formatKwh(row.totalWh)),
          h('td', { style: 'text-align:right' }, formatDong(row.energyDong)),
          h('td', { style: 'text-align:right' }, formatDong(row.idleDong)),
          h('td', { style: 'text-align:right;font-weight:600' }, formatDong(row.totalDong))
        ))
      );

      const tfoot = h('tfoot', { style: 'background:var(--color-surface-sunken);font-weight:bold' },
        h('tr', {},
          h('td', { colspan: '3', style: 'text-align:right' }, 'TỔNG CỘNG:'),
          h('td', { style: 'text-align:right' }, formatNumber(summary.sessions ?? 0)),
          h('td', { style: 'text-align:right' }, formatKwh(summary.totalWh ?? 0)),
          h('td', { style: 'text-align:right' }, formatDong(summary.energyDong ?? 0)),
          h('td', { style: 'text-align:right' }, formatDong(summary.idleDong ?? 0)),
          h('td', { style: 'text-align:right;color:var(--color-primary-text, #10b981)' }, formatDong(summary.totalDong ?? 0))
        )
      );

      tableEl = h('div', { class: 'card', style: 'overflow-x:auto' },
        h('table', { class: 'table', style: 'width:100%' },
          h('thead', {},
            h('tr', {},
              h('th', {}, 'Trạm sạc'),
              h('th', {}, 'Trụ sạc'),
              h('th', {}, 'Đầu nối'),
              h('th', { style: 'text-align:right' }, 'Số phiên'),
              h('th', { style: 'text-align:right' }, 'Sản lượng (kWh)'),
              h('th', { style: 'text-align:right' }, 'Tiền điện'),
              h('th', { style: 'text-align:right' }, 'Chiếm trụ'),
              h('th', { style: 'text-align:right' }, 'Tổng tiền')
            )
          ),
          tbody,
          tfoot
        )
      );
    }

    root.replaceChildren(
      renderHeader(),
      summaryCards,
      tableEl
    );
  }

  init();

  return () => { disposed = true; };
}
