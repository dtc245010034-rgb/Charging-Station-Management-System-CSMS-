import { h } from '../app/dom.js';
import * as csms from '../services/csms.js';

const severityLabel = {
  INFO: 'Thông tin',
  WARNING: 'Cảnh báo',
  CRITICAL: 'Nghiêm trọng',
};
const severityClass = {
  INFO: 'badge--neutral',
  WARNING: 'badge--warning',
  CRITICAL: 'badge--fault',
};

export function createAlertBand({ canRead, canClose }) {
  const band = h('section', { class: 'card alert-band', 'aria-label': 'Cảnh báo đang mở', hidden: true });
  let stopped = false;
  let loading = false;

  function paint(alerts, error = null) {
    band.replaceChildren();
    band.hidden = !error && alerts.length === 0;
    if (error) {
      band.append(h('div', { class: 'card__body' }, h('p', { class: 'form-alert', role: 'alert' }, error)));
      return;
    }
    if (!alerts.length) return;

    band.append(
      h('header', { class: 'card__header' },
        h('h2', { class: 'card__title' }, `Cảnh báo đang mở (${alerts.length})`)),
      h('div', { class: 'card__body alert-band__list' }, alerts.map((alert) => h('article', { class: 'alert-band__item' },
        h('span', { class: `badge ${severityClass[alert.severity] || severityClass.INFO}` }, severityLabel[alert.severity] || 'Cảnh báo'),
        h('span', { class: 'alert-band__message' }, alert.message),
        canClose && h('button', {
          class: 'btn btn--ghost',
          type: 'button',
          onclick: async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
              await csms.alerts.close(alert.id);
              await refresh();
            } catch (cause) {
              button.disabled = false;
              paint(alerts, cause.message);
            }
          },
        }, 'Đóng')))),
    );
  }

  async function refresh() {
    if (stopped || loading || !canRead) return;
    loading = true;
    try {
      paint(await csms.alerts.list('open'));
    } catch (error) {
      paint([], error.message);
    } finally {
      loading = false;
    }
  }

  void refresh();
  const timer = setInterval(() => { void refresh(); }, 30000);
  return { el: band, refresh, stop: () => { stopped = true; clearInterval(timer); } };
}
