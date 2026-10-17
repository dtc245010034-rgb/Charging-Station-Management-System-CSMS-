import { h, mount } from '../../app/dom.js';
import { formatNumber } from '../../app/format.js';
import { partners, settlements } from '../../services/csms.js';
import { emptyState, errorState, loadingState } from '../../components/empty-state.js';
import { toast } from '../../components/toast.js';

const money = new Intl.NumberFormat('vi-VN');

function amount(value) {
  return `${money.format(BigInt(value))} đ`;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function render(ctx) {
  const month = h('input', { class: 'input', type: 'month', name: 'month', required: true, value: currentMonth() });
  const partner = h('select', { class: 'select', name: 'partner', required: true });
  const rateList = h('div', { class: 'card__body' }, loadingState(2));
  const statementBody = h('div', { class: 'card__body' }, emptyState({ iconName: 'activity', title: 'Chọn tháng để xem bảng kê' }));
  const error = h('p', { class: 'form-alert', role: 'alert', hidden: true });
  const shareBp = h('input', { class: 'input', type: 'number', min: '0', max: '10000', step: '1', name: 'shareBp', required: true });
  const effectiveFrom = h('input', { class: 'input', type: 'date', name: 'effectiveFrom', required: true });
  const includeIdle = h('input', { type: 'checkbox', name: 'includeIdle', checked: true });
  const note = h('input', { class: 'input', name: 'note', maxlength: '500' });
  const canManage = ctx.can('settlements:manage');
  const loadStatement = h('button', { class: 'btn btn--secondary', type: 'button', onclick: () => { void refreshStatement(); } }, 'Xem bảng kê');
  const generate = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { void generateStatement(); } }, 'Lập bảng kê');
  const rateSubmit = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Lưu tỷ lệ');
  const rateForm = h('form', { class: 'stack', onsubmit: async (event) => {
    event.preventDefault();
    error.hidden = true;
    if (!partner.value) {
      error.textContent = 'Chọn chủ trạm trước khi lưu tỷ lệ.';
      error.hidden = false;
      return;
    }
    rateSubmit.disabled = true;
    try {
      await partners.createShareRate(partner.value, {
        shareBp: Number(shareBp.value),
        includeIdle: includeIdle.checked,
        effectiveFrom: effectiveFrom.value,
        note: note.value,
      });
      toast('Đã lưu tỷ lệ chia.');
      await refreshRates();
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
    } finally {
      rateSubmit.disabled = false;
    }
  } },
  h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Tỷ lệ chia (điểm cơ bản, 0–10000)'), shareBp),
  h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Hiệu lực từ ngày'), effectiveFrom),
  h('label', { class: 'field' }, includeIdle, h('span', { class: 'field__label' }, 'Tính phí chiếm trụ vào nền chia')),
  h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Ghi chú'), note),
  error, rateSubmit);

  ctx.root.replaceChildren(
    h('div', { class: 'page-stack' },
      h('header', { class: 'page-head' }, h('div', {},
        h('p', { class: 'eyebrow' }, 'Đối soát'),
        h('h1', { class: 'page-head__title' }, 'Bảng kê đối tác')
      )),
      h('section', { class: 'card' },
        h('div', { class: 'card__body' },
          h('div', { class: 'toolbar' },
            h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Chủ trạm'), partner),
            h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'Tháng'), month),
            loadStatement,
            ...(canManage ? [generate] : [])
          )
        )
      ),
      ...(canManage ? [
        h('section', { class: 'card' },
          h('div', { class: 'card__body' },
            h('h2', { class: 'section-title' }, 'Khai tỷ lệ chia'),
            rateForm
          )
        ),
        h('section', { class: 'card', 'aria-label': 'Lịch sử tỷ lệ chia' }, rateList),
      ] : []),
      h('section', { class: 'card', 'aria-label': 'Bảng kê đối tác' }, statementBody)
    )
  );

  partner.addEventListener('change', () => {
    void refreshRates();
    void refreshStatement();
  });
  month.addEventListener('change', () => { void refreshStatement(); });
  void loadPartners();

  async function loadPartners() {
    try {
      const result = await partners.list();
      if (!result.partners.length) {
        partner.append(h('option', { value: '' }, 'Không có chủ trạm'));
        return;
      }
      partner.replaceChildren(...result.partners.map((item) => h('option', { value: item.id }, item.name)));
      await refreshRates();
      await refreshStatement();
    } catch (failure) {
      mount(statementBody, errorState({ message: failure.message, onRetry: () => { void loadPartners(); } }));
    }
  }

  async function refreshRates() {
    if (!canManage || !partner.value) return;
    mount(rateList, loadingState(2));
    try {
      const result = await partners.shareRates(partner.value);
      if (!result.share_rates.length) {
        mount(rateList, emptyState({ iconName: 'activity', title: 'Chưa có tỷ lệ chia' }));
        return;
      }
      mount(rateList,
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', {}, h('tr', {}, ['Hiệu lực từ', 'Tỷ lệ (điểm cơ bản)', 'Tính phí chiếm trụ', 'Ghi chú'].map((label) => h('th', { scope: 'col' }, label)))),
            h('tbody', {}, result.share_rates.map((rate) => h('tr', {},
              h('td', {}, rate.effective_from),
              h('td', {}, formatNumber(rate.share_bp)),
              h('td', {}, rate.include_idle ? 'Có' : 'Không'),
              h('td', {}, rate.note || '—')
            )))
          )
        )
      );
    } catch (failure) {
      mount(rateList, errorState({ message: failure.message, onRetry: () => { void refreshRates(); } }));
    }
  }

  async function refreshStatement() {
    if (!month.value) return;
    mount(statementBody, loadingState(5));
    try {
      const result = await settlements.get(month.value);
      const lines = result.lines.filter((line) => String(line.owner_id) === String(partner.value));
      const summary = lines.reduce((totals, line) => {
        totals.revenue_dong += BigInt(line.energy_dong) + BigInt(line.idle_dong);
        totals.share_dong += BigInt(line.share_dong);
        totals.platform_dong = totals.revenue_dong - totals.share_dong;
        return totals;
      }, { revenue_dong: 0n, share_dong: 0n, platform_dong: 0n });
      const rows = lines.map((line) => h('tr', {},
        h('td', {}, formatNumber(line.owner_id)),
        h('td', {}, `${line.from_date} – ${line.to_date}`),
        h('td', {}, `${formatNumber(line.share_bp)} bp`),
        h('td', {}, formatNumber(line.sessions)),
        h('td', {}, amount(line.base_dong)),
        h('td', {}, amount(line.share_dong))
      ));
      mount(statementBody,
        h('section', { class: 'grid grid--3', 'aria-label': 'Tổng hợp bảng kê' },
          h('article', { class: 'card' }, h('div', { class: 'card__body' }, h('div', { class: 'muted' }, 'Doanh thu'), h('strong', { class: 'cell-strong' }, amount(summary.revenue_dong)))),
          h('article', { class: 'card' }, h('div', { class: 'card__body' }, h('div', { class: 'muted' }, 'Chia đối tác'), h('strong', { class: 'cell-strong' }, amount(summary.share_dong)))),
          h('article', { class: 'card' }, h('div', { class: 'card__body' }, h('div', { class: 'muted' }, 'Phần nền tảng'), h('strong', { class: 'cell-strong' }, amount(summary.platform_dong))))
        ),
        h('p', { class: 'muted' }, `Kỳ ${result.statement.month}, phiên bản ${formatNumber(result.statement.version)}.`),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', {}, h('tr', {}, ['Chủ trạm ID', 'Khoảng ngày', 'Tỷ lệ', 'Phiên', 'Nền chia', 'Phần đối tác'].map((label) => h('th', { scope: 'col' }, label)))),
            h('tbody', {}, rows)
          )
        )
      );
    } catch (failure) {
      mount(statementBody, errorState({ message: failure.message, onRetry: () => { void refreshStatement(); } }));
    }
  }

  async function generateStatement() {
    if (!month.value) return;
    generate.disabled = true;
    try {
      await settlements.generate(month.value);
      toast('Đã lập bảng kê.');
      await refreshStatement();
    } catch (failure) {
      mount(statementBody, errorState({ message: failure.message, onRetry: () => { void generateStatement(); } }));
    } finally {
      generate.disabled = false;
    }
  }
}
