import { h } from '../app/dom.js';
import { formatClock, formatLongDate } from '../app/format.js';
import * as csms from '../services/csms.js';
import { subscribe } from '../services/realtime.js';
import { roleTag } from './badge.js';

// Đầu trang workspace: lời chào, ngày giờ, và tình trạng hệ thống lấy từ /api/health (không hard-code).
export function workspaceHero({ user, roleLabel, subtitle }) {
  const time = h('div', { class: 'hero__time' }, formatClock());
  const date = h('div', { class: 'hero__date' }, formatLongDate());
  const healthText = h('span', {}, 'Đang kiểm tra hệ thống…');
  const health = h('span', { class: 'health', role: 'status' }, h('span', { class: 'dot' }), healthText);
  const firstName = user.name.trim().split(/\s+/).slice(-1)[0];

  const el = h('section', { class: 'hero', 'aria-label': 'Tổng quan workspace' },
    h('div', {},
      roleTag(roleLabel),
      h('h1', { class: 'hero__title' }, `Chào mừng, ${firstName}!`),
      h('p', { class: 'hero__sub' }, subtitle)),
    h('div', { class: 'hero__side' }, date, time, health));

  const clock = setInterval(() => { time.textContent = formatClock(); date.textContent = formatLongDate(); }, 30000);
  const poll = subscribe(csms.health, (data) => {
    const ok = data.ok === true;
    health.dataset.state = ok ? 'ok' : 'bad';
    healthText.textContent = ok ? 'Hệ thống hoạt động ổn định' : 'Hệ thống gặp sự cố';
  }, {
    intervalMs: 30000,
    onError: () => { health.dataset.state = 'bad'; healthText.textContent = 'Không kết nối được máy chủ'; },
  });
  return { el, destroy() { clearInterval(clock); poll.stop(); } };
}
