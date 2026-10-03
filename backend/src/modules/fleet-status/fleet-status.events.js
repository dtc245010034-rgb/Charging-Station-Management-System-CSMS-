const subscribers = new Set();

function subscribe(listener) {
  if (typeof listener !== 'function') throw new TypeError('listener must be a function');
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function publish(event) {
  for (const listener of subscribers) listener(event);
}

module.exports = { publish, subscribe };
