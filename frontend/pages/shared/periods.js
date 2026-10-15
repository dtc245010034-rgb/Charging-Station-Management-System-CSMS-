import { h } from '../../app/dom.js';
import { formatDateTime } from '../../app/format.js';
import * as csms from '../../services/csms.js';
import { statusBadge } from '../../components/badge.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { toast } from '../../components/toast.js';

export function render(ctx) {
  let disposed = false;
  const canClose = ctx.can('periods:manage');
  const canReopen = ctx.can('periods:reopen');

  const root = h('div', { class: 'page-stack', style: 'max-width:1000px;margin:0 auto;padding-bottom:40px' });
  ctx.root.replaceChildren(root);

  let periodList = [];
  let blockingSessions = null;
  let closeMonth = '';
  let reopenModalMonth = null;
  let reopenReason = '';

  function getDefaultPreviousMonth() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  }

  closeMonth = getDefaultPreviousMonth();

  async function loadData() {
    if (disposed) return;
    root.replaceChildren(renderHeader(), loadingState(3));
    try {
      periodList = await csms.periods.list();
      if (disposed) return;
      renderContent();
    } catch (err) {
      if (disposed) return;
      root.replaceChildren(
        renderHeader(),
        errorState({
          title: 'Không thể tải danh sách kỳ đối soát',
          text: err.message || 'Đã có lỗi xảy ra khi tải dữ liệu.',
          actionLabel: 'Thử lại',
          onAction: () => loadData(),
        })
      );
    }
  }

  function renderHeader() {
    return h('div', { class: 'page-head' },
      h('p', { class: 'eyebrow' }, 'Kế toán & Đối soát'),
      h('h1', { class: 'page-head__title' }, 'Kỳ đối soát')
    );
  }

  async function handleClosePeriod() {
    if (!closeMonth) return;
    try {
      await csms.periods.close(closeMonth);
      toast('Chốt kỳ đối soát thành công');
      blockingSessions = null;
      loadData();
    } catch (err) {
      if (err.code === 'PERIOD_BLOCKED' && err.details?.blockingSessions) {
        blockingSessions = err.details.blockingSessions;
        toast('Không thể chốt kỳ: còn phiên sạc bất thường hoặc chưa lập hoá đơn', 'error');
        renderContent();
      } else {
        toast(err.message || 'Không thể chốt kỳ', 'error');
      }
    }
  }

  async function handleReopenPeriod() {
    if (!reopenModalMonth) return;
    if (reopenReason.trim().length < 10) {
      toast('Lý do mở lại phải có ít nhất 10 ký tự', 'error');
      return;
    }
    try {
      await csms.periods.reopen(reopenModalMonth, reopenReason.trim());
      toast('Mở lại kỳ đối soát thành công');
      reopenModalMonth = null;
      reopenReason = '';
      loadData();
    } catch (err) {
      toast(err.message || 'Không thể mở lại kỳ', 'error');
    }
  }

  function renderContent() {
    const header = renderHeader();

    // Khối chốt kỳ
    let closeCard = null;
    if (canClose) {
      const monthInput = h('input', {
        type: 'month',
        class: 'input',
        style: 'width:auto',
        value: closeMonth,
        onchange: (e) => { closeMonth = e.target.value; },
      });

      const closeBtn = h('button', {
        type: 'button',
        class: 'btn btn--primary',
        onclick: handleClosePeriod,
      }, icon('lock'), 'Chốt kỳ này');

      closeCard = h('div', { class: 'card', style: 'padding:20px;margin-bottom:24px' },
        h('h3', { style: 'margin:0 0 8px 0;font-size:16px' }, 'Chốt kỳ kế toán mới'),
        h('p', { class: 'cell-sub', style: 'margin-bottom:16px' },
          'Khi chốt kỳ, mọi hoá đơn, dòng hoá đơn, sổ cái và phiên sạc trong kỳ sẽ trở thành chỉ đọc. Chỉ được chốt tháng đã kết thúc và không còn phiên bất thường.'
        ),
        h('div', { class: 'toolbar', style: 'gap:12px;align-items:center' },
          h('span', { class: 'muted' }, 'Chọn tháng:'),
          monthInput,
          closeBtn
        )
      );
    }

    // Danh sách phiên chặn (nếu có)
    let blockingCard = null;
    if (blockingSessions && blockingSessions.length > 0) {
      blockingCard = h('div', {
        class: 'card',
        style: 'padding:16px;margin-bottom:24px;border:1px solid var(--color-danger, #ef4444);background:rgba(239, 68, 68, 0.05)'
      },
      h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:12px;color:var(--color-danger, #ef4444);font-weight:600' },
        icon('alert'),
        `Có ${blockingSessions.length} phiên sạc đang chặn chốt kỳ:`
      ),
      h('ul', { style: 'margin:0;padding-left:20px;display:grid;gap:6px' },
        ...blockingSessions.map((s) => h('li', {},
          `Phiên #${s.id} — Trụ ${s.charge_point_id}, Đầu nối ${s.connector_no} — Trạng thái: ${s.status}${s.billing_status ? ` (Hoá đơn: ${s.billing_status})` : ''}${s.billing_reason ? ` [${s.billing_reason}]` : ''}`
        ))
      )
      );
    }

    // Bảng các kỳ đối soát
    let tableCard = null;
    if (periodList.length === 0) {
      tableCard = emptyState({
        iconName: 'calendar',
        title: 'Chưa có kỳ đối soát nào được chốt',
        text: 'Sử dụng khung bên trên để chốt kỳ kế toán cho tháng đã kết thúc.',
      });
    } else {
      const tbody = h('tbody', {},
        ...periodList.map((p) => {
          const isClosed = p.status === 'CLOSED';
          const badge = isClosed
            ? statusBadge('neutral', 'Đã chốt')
            : statusBadge('ready', 'Đang mở');

          let reopenBtn = null;
          if (isClosed && canReopen) {
            reopenBtn = h('button', {
              type: 'button',
              class: 'btn btn--subtle',
              style: 'padding:4px 8px;font-size:12px',
              onclick: () => {
                reopenModalMonth = p.month;
                reopenReason = '';
                renderContent();
              },
            }, icon('unlock'), 'Mở lại kỳ');
          }

          return h('tr', {},
            h('td', { class: 'cell-strong' }, p.month),
            h('td', {}, badge),
            h('td', { class: 'cell-sub' }, p.closed_at ? formatDateTime(p.closed_at) : '—'),
            h('td', { class: 'cell-sub' }, p.reopened_at ? `${formatDateTime(p.reopened_at)} (${p.reopen_reason || ''})` : '—'),
            h('td', { style: 'text-align:right' }, reopenBtn)
          );
        })
      );

      tableCard = h('div', { class: 'card', style: 'overflow-x:auto' },
        h('table', { class: 'table', style: 'width:100%' },
          h('thead', {},
            h('tr', {},
              h('th', {}, 'Tháng'),
              h('th', {}, 'Trạng thái'),
              h('th', {}, 'Thời điểm chốt'),
              h('th', {}, 'Mở lại gần nhất'),
              h('th', { style: 'text-align:right' }, 'Thao tác')
            )
          ),
          tbody
        )
      );
    }

    // Modal mở lại kỳ
    let modal = null;
    if (reopenModalMonth) {
      const reasonInput = h('textarea', {
        class: 'input',
        style: 'width:100%;height:80px',
        placeholder: 'Nhập lý do mở lại kỳ đối soát (tối thiểu 10 ký tự)...',
        value: reopenReason,
        oninput: (e) => { reopenReason = e.target.value; },
      });

      modal = h('div', {
        style: 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:999'
      },
      h('div', { class: 'card', style: 'max-width:480px;width:100%;padding:24px' },
        h('h3', { style: 'margin-top:0' }, `Mở lại kỳ đối soát ${reopenModalMonth}`),
        h('p', { class: 'cell-sub', style: 'margin-bottom:12px' },
          'Mở lại kỳ sẽ cho phép cập nhật phiên hoặc hoá đơn của tháng này. Thao tác này sẽ được ghi vào nhật ký điều khiển.'
        ),
        reasonInput,
        h('div', { class: 'toolbar', style: 'justify-content:flex-end;margin-top:16px;gap:8px' },
          h('button', {
            type: 'button',
            class: 'btn',
            onclick: () => { reopenModalMonth = null; renderContent(); }
          }, 'Huỷ'),
          h('button', {
            type: 'button',
            class: 'btn btn--primary',
            onclick: handleReopenPeriod
          }, icon('unlock'), 'Xác nhận mở lại')
        )
      )
      );
    }

    root.replaceChildren(
      header,
      closeCard || h('div'),
      blockingCard || h('div'),
      tableCard,
      modal || h('div')
    );
  }

  loadData();

  return () => { disposed = true; };
}
