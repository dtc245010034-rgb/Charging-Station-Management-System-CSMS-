import { h } from '../app/dom.js';
import { icon } from './icons.js';

let region;

export function toast(message, { kind = 'success', ms = 4500 } = {}) {
  if (!region?.isConnected) {
    region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(region);
  }
  const item = h('div', { class: 'toast', 'data-kind': kind, role: kind === 'error' ? 'alert' : null },
    icon(kind === 'error' ? 'alert' : 'check'), h('span', {}, message));
  region.append(item);
  setTimeout(() => item.remove(), ms);
  return item;
}
