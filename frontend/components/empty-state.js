import { h } from '../app/dom.js';
import { icon } from './icons.js';

export function emptyState({ iconName = 'inbox', title, text, action } = {}) {
  return h('div', { class: 'state' },
    h('span', { class: 'state__icon' }, icon(iconName, { size: 22 })),
    h('p', { class: 'state__title' }, title),
    text && h('p', { class: 'state__text' }, text),
    action);
}

export function errorState({ message, onRetry } = {}) {
  return h('div', { class: 'state state--error', role: 'alert' },
    h('span', { class: 'state__icon' }, icon('alert', { size: 22 })),
    h('p', { class: 'state__title' }, 'Không tải được dữ liệu'),
    h('p', { class: 'state__text' }, message || 'Đã có lỗi xảy ra, vui lòng thử lại.'),
    onRetry && h('button', { class: 'btn', type: 'button', onclick: onRetry }, icon('refresh'), 'Thử lại'));
}

export function loadingState(rows = 4) {
  return h('div', { class: 'state', 'aria-busy': 'true', 'aria-label': 'Đang tải' },
    ...Array.from({ length: rows }, () => h('div', { class: 'skeleton', style: 'height:16px;width:min(100%,320px)' })));
}
