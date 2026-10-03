// Dùng SSE cho màn hình có eventsUrl; polling vẫn được giữ cho các màn hình còn lại và làm fallback.
export function subscribe(load, onData, { intervalMs = 15000, onError, eventsUrl } = {}) {
  let timer = null;
  let stopped = false;
  let failures = 0;
  let inFlight = false;
  let refreshPending = false;
  let eventSource = null;
  let eventFailures = 0;
  let fallback = false;

  async function tick() {
    if (stopped) return;
    if (inFlight) { refreshPending = true; return; }
    inFlight = true;
    try {
      if (!document.hidden) { onData(await load()); failures = 0; }
    } catch (error) {
      failures += 1;
      onError?.(error);
    } finally {
      inFlight = false;
      if (refreshPending) {
        refreshPending = false;
        queueMicrotask(tick);
      } else if (!stopped && (!eventSource || fallback)) {
        timer = setTimeout(tick, Math.min(intervalMs * 2 ** failures, 120000));
      }
    }
  }

  const onVisible = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
  document.addEventListener('visibilitychange', onVisible);

  if (eventsUrl && typeof EventSource === 'function') {
    eventSource = new EventSource(eventsUrl);
    eventSource.onopen = () => {
      eventFailures = 0;
      fallback = false;
      clearTimeout(timer);
      tick();
    };
    eventSource.onmessage = () => {
      clearTimeout(timer);
      tick();
    };
    eventSource.onerror = () => {
      eventFailures += 1;
      if (eventFailures >= 3 && !fallback) {
        fallback = true;
        clearTimeout(timer);
        tick();
      }
    };
  }

  tick();

  return {
    refresh: () => { clearTimeout(timer); return tick(); },
    stop() {
      stopped = true;
      clearTimeout(timer);
      eventSource?.close();
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
