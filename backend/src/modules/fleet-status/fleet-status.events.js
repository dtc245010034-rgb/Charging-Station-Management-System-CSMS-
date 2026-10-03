const subscribers = new Set();

function subscribe(listener) {
  if (typeof listener !== 'function') throw new TypeError('listener must be a function');
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

// Một người nghe hỏng không được chặn người nghe khác hay làm hỏng handler OCPP đang gọi publish().
function publish(event) {
  for (const listener of subscribers) {
    try {
      listener(event);
    } catch {
      subscribers.delete(listener);
    }
  }
}

module.exports = { publish, subscribe };
