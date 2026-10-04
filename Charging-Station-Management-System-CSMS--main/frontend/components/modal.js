import { h } from '../app/dom.js';
import { icon } from './icons.js';

// Dùng <dialog> gốc: khoá focus trong hộp thoại, Esc để đóng, trả focus về nút đã mở.
export function openDialog({ className, title, subtitle, body, footer, onClose }) {
  const opener = document.activeElement;
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  const isDrawer = className.includes('drawer');
  const bodyEl = h('div', { class: isDrawer ? 'drawer__body' : 'modal__body' }, body);
  const titleEl = h('h2', { class: isDrawer ? 'drawer__title' : 'modal__title', id: titleId }, title);
  const subEl = h('div', {}, subtitle);
  const dialog = h('dialog', { class: className, 'aria-labelledby': titleId },
    h('div', { class: isDrawer ? 'drawer__head' : 'modal__head' },
      h('div', {}, titleEl, subEl),
      h('button', { class: 'btn btn--ghost btn--icon', type: 'button', 'aria-label': 'Đóng', onclick: () => dialog.close() }, icon('x'))),
    bodyEl,
    footer && h('div', { class: 'modal__foot' }, footer));

  dialog.addEventListener('close', () => { dialog.remove(); opener?.focus?.(); onClose?.(); });
  // Bấm ra ngoài (vào lớp nền của dialog) để đóng.
  dialog.addEventListener('mousedown', (event) => { if (event.target === dialog) dialog.close(); });
  document.body.append(dialog);
  dialog.showModal();

  return {
    dialog,
    close: () => dialog.close(),
    setBody: (...nodes) => { bodyEl.replaceChildren(...nodes); },
    setTitle: (text, sub) => { titleEl.textContent = text; subEl.replaceChildren(...(sub ? [sub] : [])); },
  };
}

export const openModal = (options) => openDialog({ className: 'modal', ...options });
export const openDrawer = (options) => openDialog({ className: 'drawer', ...options });
