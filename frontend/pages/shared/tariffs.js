import { h } from '../../app/dom.js';
import { routeFor } from '../../app/workspace.js';
import { formatNumber } from '../../app/format.js';
import * as csms from '../../services/csms.js';
import { statusBadge } from '../../components/badge.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { icon } from '../../components/icons.js';
import { toast } from '../../components/toast.js';

function formatMoney(amount) {
  return `${formatNumber(amount ?? 0)} đ`;
}

function minToTime(m) {
  if (m === 1440) return '24:00';
  const hour = Math.floor(m / 60);
  const min = m % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const STATE_BADGES = {
  ACTIVE: { tone: 'ready', label: 'Đang áp dụng' },
  SCHEDULED: { tone: 'charging', label: 'Sắp áp dụng' },
  EXPIRED: { tone: 'neutral', label: 'Hết hiệu lực' },
};

export function render(ctx) {
  let disposed = false;
  const canWrite = ctx.can('tariffs:write');
  const stationId = ctx.params.id;

  const root = h('div', { class: 'page-stack', style: 'max-width:1000px;margin:0 auto;padding-bottom:40px' });
  ctx.root.replaceChildren(root);

  if (!stationId) {
    // Nếu không có stationId, hướng dẫn quay lại danh sách trạm
    root.replaceChildren(
      h('header', {},
        h('p', { class: 'eyebrow' }, 'Biểu giá'),
        h('h1', { class: 'page-head__title' }, 'Biểu giá trạm sạc')
      ),
      emptyState({
        iconName: 'station',
        title: 'Chưa chọn trạm sạc',
        text: 'Vui lòng mở một trạm từ danh sách trạm để xem hoặc thiết lập biểu giá.',
        action: h('a', { class: 'btn', href: routeFor(ctx.workspace, 'stations') }, icon('station'), 'Mở danh sách trạm'),
      })
    );
    return () => { disposed = true; };
  }

  let station = null;
  let tariffList = [];
  let showForm = false;

  async function loadData() {
    try {
      root.replaceChildren(loadingState(3));
      const [st, list] = await Promise.all([
        csms.stations.get(stationId),
        csms.tariffs.list(stationId),
      ]);
      if (disposed) return;
      station = st;
      tariffList = list;
      paint();
    } catch (err) {
      if (!disposed) {
        root.replaceChildren(errorState({
          message: err.message || 'Không thể tải biểu giá',
          onRetry: loadData,
        }));
      }
    }
  }

  function paint() {
    const tz = station?.timezone || 'Asia/Ho_Chi_Minh';
    const header = h('header', { style: 'display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap' },
      h('div', {},
        h('p', { class: 'eyebrow' }, 'Quản lý biểu giá'),
        h('h1', { class: 'page-head__title' }, `Biểu giá: ${station.name}`),
        h('p', { class: 'muted' }, `${station.address} · Múi giờ: `, h('strong', {}, tz))
      ),
      canWrite && !showForm && h('button', {
        class: 'btn btn--primary',
        type: 'button',
        onclick: () => { showForm = true; paint(); },
      }, icon('plus'), 'Khai báo biểu giá mới')
    );

    const content = [];

    if (showForm) {
      content.push(buildForm());
    }

    if (tariffList.length === 0 && !showForm) {
      content.push(
        emptyState({
          iconName: 'sliders',
          title: 'Trạm chưa có biểu giá',
          text: canWrite ? 'Bấm "Khai báo biểu giá mới" để bắt đầu thiết lập giá điện và phí chiếm trụ.' : 'Chưa có biểu giá nào được áp dụng cho trạm này.',
        })
      );
    } else {
      content.push(buildVersionList());
    }

    root.replaceChildren(header, ...content);
  }

  function buildForm() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: station?.timezone || 'Asia/Ho_Chi_Minh' }).format(new Date());
    const hasTariffs = tariffList.length > 0;

    // Tính ngày min: hôm nay nếu chưa có biểu giá, ngày mai nếu đã có biểu giá
    let minDate = today;
    if (hasTariffs) {
      const tomorrow = new Date(Date.now() + 86400000);
      minDate = new Intl.DateTimeFormat('en-CA', { timeZone: station?.timezone || 'Asia/Ho_Chi_Minh' }).format(tomorrow);
    }

    const effectiveInput = h('input', {
      class: 'input',
      type: 'date',
      min: minDate,
      value: minDate,
      required: true,
      id: 'tariff-effective-from',
    });

    const graceInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      max: '240',
      step: '1',
      value: '15',
      required: true,
      id: 'tariff-grace-min',
    });

    const perMinInput = h('input', {
      class: 'input',
      type: 'number',
      min: '0',
      max: '100000',
      step: '1',
      value: '1000',
      required: true,
      id: 'tariff-per-min',
    });

    // Mảng khung giờ dynamic
    let periods = [
      { from: '00:00', to: '24:00', pricePerKwh: 4000, label: 'Cả ngày' },
    ];

    const periodsContainer = h('div', { style: 'display:grid;gap:10px;margin-top:10px' });
    const errorBox = h('div', { class: 'form-alert', role: 'alert', hidden: true, style: 'margin-top:12px' });

    function renderPeriodRows() {
      periodsContainer.replaceChildren(
        ...periods.map((period, idx) => {
          const fromIn = h('input', {
            class: 'input',
            type: 'text',
            value: period.from,
            placeholder: '00:00',
            required: true,
            style: 'max-width:110px',
            oninput: (e) => { period.from = e.target.value.trim(); },
          });

          const toIn = h('input', {
            class: 'input',
            type: 'text',
            value: period.to,
            placeholder: '24:00',
            required: true,
            style: 'max-width:110px',
            oninput: (e) => { period.to = e.target.value.trim(); },
          });

          const priceIn = h('input', {
            class: 'input',
            type: 'number',
            min: '0',
            max: '1000000',
            step: '1',
            value: String(period.pricePerKwh),
            placeholder: '4000',
            required: true,
            style: 'max-width:150px',
            oninput: (e) => { period.pricePerKwh = Number(e.target.value); },
          });

          const labelIn = h('input', {
            class: 'input',
            type: 'text',
            maxlength: '40',
            value: period.label || '',
            placeholder: 'Tên khung (tuỳ chọn)',
            oninput: (e) => { period.label = e.target.value; },
          });

          const removeBtn = periods.length > 1 ? h('button', {
            class: 'btn btn--ghost',
            type: 'button',
            'aria-label': 'Xoá khung',
            onclick: () => {
              periods.splice(idx, 1);
              renderPeriodRows();
            },
          }, icon('trash') || 'Xoá') : h('span', { style: 'width:36px' });

          return h('div', {
            class: 'card',
            style: 'padding:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap',
          },
          h('label', { style: 'display:grid;gap:4px' }, h('span', { class: 'muted', style: 'font-size:12px' }, 'Từ'), fromIn),
          h('label', { style: 'display:grid;gap:4px' }, h('span', { class: 'muted', style: 'font-size:12px' }, 'Đến'), toIn),
          h('label', { style: 'display:grid;gap:4px' }, h('span', { class: 'muted', style: 'font-size:12px' }, 'Đơn giá (đ/kWh)'), priceIn),
          h('label', { style: 'display:grid;gap:4px;flex:1' }, h('span', { class: 'muted', style: 'font-size:12px' }, 'Nhãn khung'), labelIn),
          removeBtn
          );
        })
      );
    }

    renderPeriodRows();

    const addPeriodBtn = h('button', {
      class: 'btn',
      type: 'button',
      onclick: () => {
        periods.push({ from: '', to: '', pricePerKwh: 4000, label: '' });
        renderPeriodRows();
      },
    }, icon('plus'), 'Thêm khung giờ');

    const submitBtn = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Lưu biểu giá');
    const cancelBtn = h('button', {
      class: 'btn',
      type: 'button',
      onclick: () => { showForm = false; paint(); },
    }, 'Huỷ');

    return h('form', {
      class: 'card',
      style: 'padding:20px;display:grid;gap:16px',
      onsubmit: async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        errorBox.replaceChildren();
        submitBtn.disabled = true;

        const payload = {
          effectiveFrom: effectiveInput.value,
          periods: periods.map((p) => ({
            from: p.from,
            to: p.to,
            pricePerKwh: Number(p.pricePerKwh),
            label: p.label || undefined,
          })),
          idle: {
            graceMin: Number(graceInput.value),
            perMinDong: Number(perMinInput.value),
          },
        };

        try {
          await csms.tariffs.create(stationId, payload);
          toast('Đã lưu biểu giá mới thành công.');
          showForm = false;
          await loadData();
        } catch (err) {
          errorBox.hidden = false;
          const details = err.details || [];
          if (Array.isArray(details) && details.length > 0) {
            const listItems = details.map((item) => {
              let text = item.message || '';
              if (item.type === 'OVERLAP') {
                text = `Chồng lấn khung giờ: từ ${item.from} đến ${item.to}`;
              } else if (item.type === 'GAP') {
                text = `Khoảng trống chưa có giá: từ ${item.from} đến ${item.to}`;
              }
              return h('li', {}, text);
            });
            errorBox.replaceChildren(
              h('p', { style: 'font-weight:600;margin-bottom:6px' }, err.message || 'Khung giờ không hợp lệ:'),
              h('ul', { style: 'margin:0;padding-left:20px' }, ...listItems)
            );
          } else {
            errorBox.textContent = err.message || 'Không thể lưu biểu giá.';
          }
        } finally {
          submitBtn.disabled = false;
        }
      },
    },
    h('h2', { style: 'font-size:18px;margin:0' }, 'Khai báo biểu giá mới'),
    h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px' },
      h('label', { style: 'display:grid;gap:6px' },
        h('span', { class: 'field__label' }, 'Ngày hiệu lực (giờ trạm)'),
        effectiveInput,
        h('span', { class: 'field__hint' }, hasTariffs ? 'Chỉ được áp dụng từ ngày mai trở đi' : 'Phiên bản đầu tiên có thể áp dụng từ hôm nay')
      ),
      h('label', { style: 'display:grid;gap:6px' },
        h('span', { class: 'field__label' }, 'Thời gian ân hạn (phút)'),
        graceInput,
        h('span', { class: 'field__hint' }, 'Từ 0 đến 240 phút')
      ),
      h('label', { style: 'display:grid;gap:6px' },
        h('span', { class: 'field__label' }, 'Phí chiếm trụ (đ/phút)'),
        perMinInput,
        h('span', { class: 'field__hint' }, 'Tính sau khi hết thời gian ân hạn')
      )
    ),
    h('div', { style: 'margin-top:10px' },
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px' },
        h('h3', { style: 'font-size:15px;margin:0' }, 'Khung giờ trong ngày (phải phủ đủ 24 giờ)'),
        addPeriodBtn
      ),
      periodsContainer
    ),
    errorBox,
    h('div', { style: 'display:flex;gap:10px;justify-content:flex-end;margin-top:10px' },
      cancelBtn,
      submitBtn
    )
    );
  }

  function buildVersionList() {
    return h('div', { style: 'display:grid;gap:16px;margin-top:20px' },
      h('h2', { style: 'font-size:18px;margin:0' }, `Lịch sử các phiên bản (${tariffList.length})`),
      ...tariffList.map((t) => {
        const badgeInfo = STATE_BADGES[t.state] || { tone: 'neutral', label: t.state };
        const badge = statusBadge(t.state, t.state, badgeInfo.tone, badgeInfo.label);

        return h('section', { class: 'card', style: 'padding:16px;display:grid;gap:12px' },
          h('header', { style: 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap' },
            h('div', { style: 'display:flex;align-items:center;gap:10px' },
              h('span', { class: 'cell-strong' }, `Phiên bản v${t.version}`),
              badge
            ),
            h('span', { class: 'muted', style: 'font-size:13px' },
              'Hiệu lực từ: ', h('strong', {}, t.effective_from)
            ),
            t.expiredFrom && h('span', { class: 'muted', style: 'font-size:13px' },
              'Hết hiệu lực từ: ', h('strong', {}, t.expiredFrom)
            )
          ),
          h('div', { style: 'display:flex;gap:20px;font-size:13px;flex-wrap:wrap', class: 'muted' },
            h('span', {}, 'Ân hạn: ', h('strong', { style: 'color:var(--text)' }, `${t.idle_grace_min} phút`)),
            h('span', {}, 'Phí chiếm trụ: ', h('strong', { style: 'color:var(--text)' }, `${formatMoney(t.idle_per_min_dong)}/phút`)),
            t.created_by_email && h('span', {}, 'Người tạo: ', h('span', { class: 'mono' }, t.created_by_email))
          ),
          h('table', { class: 'table', style: 'width:100%;margin-top:4px' },
            h('thead', {},
              h('tr', {},
                h('th', {}, 'Khung giờ'),
                h('th', {}, 'Đơn giá'),
                h('th', {}, 'Nhãn')
              )
            ),
            h('tbody', {},
              ...(t.periods || []).map((p) => h('tr', {},
                h('td', { class: 'mono' }, `${minToTime(p.start_minute)} – ${minToTime(p.end_minute)}`),
                h('td', { style: 'font-weight:600' }, `${formatMoney(p.price_per_kwh_dong)}/kWh`),
                h('td', {}, p.label || '—')
              ))
            )
          )
        );
      })
    );
  }

  void loadData();

  return () => { disposed = true; };
}
