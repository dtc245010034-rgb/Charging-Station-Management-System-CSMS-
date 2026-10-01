const connections = new Map();

const keyFor = (code) => String(code).trim().toUpperCase();

function connect(code, connection) {
  const key = keyFor(code);
  const previous = connections.get(key);
  if (previous && previous !== connection) previous.close(1000);
  connections.set(key, connection);
}

function disconnect(code, connection) {
  const key = keyFor(code);
  if (connection === undefined || connections.get(key) === connection) connections.delete(key);
}

const isConnected = (code) => connections.has(keyFor(code));
const getConnection = (code) => connections.get(keyFor(code));

module.exports = { connect, disconnect, getConnection, isConnected };