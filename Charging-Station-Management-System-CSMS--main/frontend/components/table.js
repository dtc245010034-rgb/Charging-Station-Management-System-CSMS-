import { h } from '../app/dom.js';

// columns: [{ key, label, render(row) → Node|string, align: 'num' }]. update() dựng lại thân bảng khi dữ liệu đổi.
export function dataTable({ columns, rowId, onRowClick, caption }) {
  const tbody = h('tbody');
  const el = h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      caption && h('caption', { class: 'sr-only' }, caption),
      h('thead', {}, h('tr', {}, columns.map((column) => h('th', { scope: 'col', class: column.align === 'num' ? 'num' : null }, column.label)))),
      tbody));

  function update(rows, selectedId = null) {
    tbody.replaceChildren(...rows.map((row) => {
      const id = rowId(row);
      const tr = h('tr', {
        'data-clickable': onRowClick ? 'true' : null,
        'aria-selected': String(id) === String(selectedId) ? 'true' : null,
        tabindex: onRowClick ? 0 : null,
        onclick: onRowClick ? () => onRowClick(row) : null,
        onkeydown: onRowClick ? (event) => { if (event.key === 'Enter') onRowClick(row); } : null,
      }, columns.map((column) => h('td', { class: column.align === 'num' ? 'num' : null }, column.render(row))));
      return tr;
    }));
  }
  return { el, update };
}
