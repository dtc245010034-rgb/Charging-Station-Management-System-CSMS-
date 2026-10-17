import { h, mount } from '../../app/dom.js';
import * as csms from '../../services/csms.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { toast } from '../../components/toast.js';

const money = new Intl.NumberFormat('vi-VN');
const previousMonth = () => {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const dong = (value) => `${money.format(BigInt(value))} đ`;
const percent = (basisPoints) => `${(basisPoints / 100).toFixed(2)}%`;

export async function render(ctx) {
  const canManage = ctx.can('settlements:manage');
  const month = h('input', { class: 'input', type: 'month', value: previousMonth(), required: true });
  const owner = h('select', { class: 'select', 'aria-label': 'Chủ trạm' });
  const message = h('div', { class: 'card__body' }, loadingState(3));
  const rateForm = h('form', { class: 'toolbar' });
  const sharePercent = h('input', { class: 'input', type: 'number', min: '0', max: '100', step: '0.01', value: '70', required: true });
  const effectiveFrom = h('input', { class: 'input', type: 'date', required: true });
  const includeIdle = h('input', { type: 'checkbox', checked: true });
  const note = h('input', { class: 'input', maxlength: '500', placeholder: 'Ghi chú hợp đồng (không bắt buộc)' });
  const rateSubmit = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Lưu tỉ lệ');
  if (canManage) {
    rateForm.append(
      h('label', { class: 'field' }, h('span', {}, 'Tỉ lệ chủ trạm (%)'), sharePercent),
      h('label', { class: 'field' }, h('span', {}, 'Hiệu lực từ ngày'), effectiveFrom),
      h('label', { class: 'field' }, h('span', {}, 'Tính phí chiếm trụ'), includeIdle),
      h('label', { class: 'field' }, h('span', {}, 'Ghi chú'), note),
      rateSubmit
    );
    rateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const basisPoints = Math.round(Number(sharePercent.value) * 100);
      rateSubmit.disabled = true;
      try {
        await csms.settlements.createRate(owner.value, {
          shareBp: basisPoints,
          includeIdle: includeIdle.checked,
          effectiveFrom: effectiveFrom.value,
          note: note.value.trim() || undefined,
        });
        toast('Đã lưu tỉ lệ chia doanh thu.');
        await refresh();
      } catch (error) {
        toast(error.message, { kind: 'error' });
      } finally {
        rateSubmit.disabled = false;
      }
    });
  }

  const form = h('form', { class: 'toolbar', onsubmit: async (event) => {
    event.preventDefault();
    await refresh();
  } },
  h('label', { class: 'field' }, h('span', {}, 'Kỳ'), month),
  h('label', { class: 'field' }, h('span', {}, 'Chủ trạm'), owner),
  h('button', { class: 'btn btn--secondary', type: 'submit' }, 'Xem bảng kê'));
  const generateButton = canManage
    ? h('button', { class: 'btn btn--primary', type: 'button', onclick: async () => {
      generateButton.disabled = true;
      try {
        await csms.settlements.generate(month.value);
        toast('Đã tạo bảng kê cho kỳ đã chốt.');
        await refresh();
      } catch (error) {
        toast(error.message, { kind: 'error' });
      } finally {
        generateButton.disabled = false;
      }
    } }, 'Tạo bảng kê kỳ đã chốt')
    : null;

  ctx.root.replaceChildren(
    h('div', { class: 'page-stack' },
      h('header', { class: 'page-head' }, h('div', {},
        h('p', { class: 'eyebrow' }, 'Kế toán'),
        h('h1', { class: 'page-head__title' }, 'Chia doanh thu')
      )),
      h('section', { class: 'card' },
        h('div', { class: 'card__body' }, form),
        canManage ? h('div', { class: 'card__body' }, rateForm) : null),
      h('section', { class: 'card', 'aria-label': 'Tỉ lệ chia doanh thu' }, message)
    )
  );

  try {
    const result = await csms.settlements.partners();
    owner.replaceChildren(...result.partners.map((partner) => h('option', { value: partner.ownerId },
      `Chủ trạm #${partner.ownerId}`)));
    if (!result.partners.length) {
      mount(message, emptyState({ iconName: 'users', title: 'Không có chủ trạm' }));
      return;
    }
    await refresh();
  } catch (error) {
    mount(message, errorState({ message: error.message }));
  }

  async function refresh() {
    if (!month.value || !owner.value) return;
    mount(message, loadingState(3));
    try {
      const [rateResponse, statement] = await Promise.all([
        csms.settlements.rates(owner.value),
        csms.settlements.get(month.value).catch((error) => {
          if (error.status === 404) return null;
          throw error;
        }),
      ]);
      const rates = h('section', {},
        h('h2', { class: 'card__title' }, 'Lịch sử tỉ lệ'),
        rateResponse.rates.length
          ? h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
            h('thead', {}, h('tr', {}, ['Hiệu lực', 'Tỉ lệ', 'Phí chiếm trụ', 'Ghi chú'].map((label) => h('th', { scope: 'col' }, label)))),
            h('tbody', {}, rateResponse.rates.map((rate) => h('tr', {},
              h('td', {}, rate.effectiveFrom),
              h('td', {}, percent(rate.shareBp)),
              h('td', {}, rate.includeIdle ? 'Có' : 'Không'),
              h('td', {}, rate.note || '—')
            )))
          ))
          : emptyState({ iconName: 'activity', title: 'Chưa có tỉ lệ chia' })
      );
      const statementPanel = statement
        ? h('section', {},
          h('div', { class: 'toolbar' },
            h('h2', { class: 'card__title' }, `Bảng kê ${statement.month} · phiên bản ${statement.version}`),
            generateButton),
          h('p', { class: 'muted' }, `Doanh thu ${dong(statement.totals.revenueDong)} · Chủ trạm ${dong(statement.totals.shareDong)} · Nền tảng ${dong(statement.totals.platformDong)}`),
          h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
            h('thead', {}, h('tr', {}, ['Từ ngày', 'Đến ngày', 'Phiên', 'Tiền điện', 'Phí chiếm trụ', 'Tỉ lệ', 'Chủ trạm nhận'].map((label) => h('th', { scope: 'col' }, label)))),
            h('tbody', {}, statement.lines.map((line) => h('tr', {},
              h('td', {}, line.fromDate),
              h('td', {}, line.toDate),
              h('td', {}, String(line.sessions)),
              h('td', {}, dong(line.energyDong)),
              h('td', {}, dong(line.idleDong)),
              h('td', {}, percent(line.shareBp)),
              h('td', {}, dong(line.shareDong))
            )))
          ))
        )
        : h('section', {}, emptyState({ iconName: 'calendar', title: 'Chưa có bảng kê cho kỳ này' }), generateButton);
      mount(message, rates, statementPanel);
    } catch (error) {
      mount(message, errorState({ message: error.message, onRetry: () => { void refresh(); } }));
    }
  }
}
