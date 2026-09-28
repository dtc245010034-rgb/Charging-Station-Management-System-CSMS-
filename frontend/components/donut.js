import { h, svg } from '../app/dom.js';

const RADIUS = 54;
const CIRC = 2 * Math.PI * RADIUS;

// Donut SVG thuần: không cần thư viện biểu đồ. segments = [{ key, label, tone }]; update({key: số}).
export function donut({ segments, caption = 'Tổng số trụ', onSelect }) {
  const arcs = new Map();
  const rows = new Map();
  const totalEl = svg('text', { class: 'donut__num', x: 70, y: 72, 'text-anchor': 'middle' }, '0');

  const chart = svg('svg', { class: 'donut__svg', viewBox: '0 0 140 140', role: 'img', 'aria-label': caption },
    svg('circle', { class: 'donut__track', cx: 70, cy: 70, r: RADIUS }),
    ...segments.map((segment) => {
      const arc = svg('circle', {
        class: 'donut__seg', cx: 70, cy: 70, r: RADIUS, transform: 'rotate(-90 70 70)',
        style: `--accent: var(--status-${segment.tone})`, 'stroke-dasharray': `0 ${CIRC}`,
      });
      arcs.set(segment.key, arc);
      return arc;
    }),
    totalEl,
    svg('text', { class: 'donut__cap', x: 70, y: 88, 'text-anchor': 'middle' }, caption));

  const legend = h('div', { class: 'legend' }, segments.map((segment) => {
    const num = h('span', { class: 'num' }, '0');
    const pct = h('span', { class: 'pct' }, '0%');
    const row = h(onSelect ? 'button' : 'div', {
      class: 'legend__row', type: onSelect ? 'button' : null,
      'aria-label': onSelect ? `Lọc trụ: ${segment.label}` : null,
      onclick: onSelect ? () => onSelect(segment.key) : null,
    }, h('span', { class: `dot dot--${segment.tone}` }), h('span', {}, segment.label), num, pct);
    rows.set(segment.key, { num, pct });
    return row;
  }));

  function update(counts) {
    const total = segments.reduce((sum, { key }) => sum + (counts[key] ?? 0), 0);
    totalEl.textContent = String(total);
    let offset = 0;
    for (const { key } of segments) {
      const value = counts[key] ?? 0;
      const length = total ? (value / total) * CIRC : 0;
      const arc = arcs.get(key);
      arc.setAttribute('stroke-dasharray', `${Math.max(length - (value && total > value ? 2 : 0), 0)} ${CIRC}`);
      arc.setAttribute('stroke-dashoffset', String(-offset));
      offset += length;
      const row = rows.get(key);
      row.num.textContent = String(value);
      row.pct.textContent = total ? `${((value / total) * 100).toFixed(1)}%` : '0%';
    }
  }
  update({});
  return { el: h('div', { class: 'donut-wrap' }, h('div', { class: 'donut' }, chart, legend)), update };
}
