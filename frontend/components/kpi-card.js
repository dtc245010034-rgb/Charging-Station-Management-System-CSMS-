import { h } from '../app/dom.js';
import { icon } from './icons.js';

// Màu ngữ nghĩa chỉ làm điểm nhấn (icon), không tô cả thẻ.
export function kpiCard({ label, iconName, tone, value, note }) {
  const valueEl = h('div', { class: 'kpi__value' });
  const noteEl = h('div', { class: 'kpi__note' });
  const el = h('div', { class: `kpi${tone ? ` kpi--${tone}` : ''}` },
    h('span', { class: 'kpi__icon' }, icon(iconName, { size: 20 })),
    h('div', { style: 'min-width:0' }, h('div', { class: 'kpi__label' }, label), valueEl, noteEl));

  function update(nextValue, nextNote = '') {
    const empty = nextValue === null || nextValue === undefined;
    valueEl.textContent = empty ? '—' : String(nextValue);
    valueEl.dataset.empty = String(empty);
    noteEl.textContent = nextNote;
  }
  update(value, note);
  return { el, update };
}
