const connections = new Map();

const keyFor = (code) => String(code).trim().toUpperCase();

function connect(code, connection) {
  const key = keyFor(code);
  const previous = connections.get(key);
  if (previous && previous !== connection) {
    previous.isReplacedByNewConnection = true;
    try {
      previous.close(1000);
    } catch {
      try {
        previous.terminate();
      } catch {
        /* ignore */
      }
    }
  }
  connections.set(key, connection);
}

function disconnect(code, connection) {
  const key = keyFor(code);
  if (connection === undefined) {
    const existed = connections.has(key);
    connections.delete(key);
    return existed;
  }
  if (connections.get(key) === connection) {
    connections.delete(key);
    return true;
  }
  return false;
}

const isConnected = (code) => connections.has(keyFor(code));
const getConnection = (code) => connections.get(keyFor(code));

module.exports = { connect, disconnect, getConnection, isConnected };