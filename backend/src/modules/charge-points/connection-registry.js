const connections = new Map();

const keyFor = (code) => String(code).trim().toUpperCase();

function connect(code) {
  const key = keyFor(code);
  connections.set(key, (connections.get(key) || 0) + 1);
}

function disconnect(code) {
  const key = keyFor(code);
  const count = connections.get(key) || 0;
  if (count <= 1) connections.delete(key);
  else connections.set(key, count - 1);
}

const isConnected = (code) => connections.has(keyFor(code));

module.exports = { connect, disconnect, isConnected };