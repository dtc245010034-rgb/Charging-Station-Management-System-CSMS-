// Máy chủ OCPP 1.6J THAM CHIẾU cho spike (mã vứt đi, KHÔNG phải backend/src/server.js).
// Dùng ocpp-rpc ở strictMode: thư viện tự kiểm mọi khung theo JSON schema chính thức của OCPP 1.6.
const { RPCServer } = require('ocpp-rpc');
const { tap, mark } = require('./frame-log');

function createServer({ registered }) {
  const server = new RPCServer({ protocols: ['ocpp1.6'], strictMode: true });
  const clients = new Map();
  const rejected = [];
  let nextTransactionId = 1000;
  const transactions = new Map();

  server.auth((accept, reject, handshake) => {
    // Thư viện mặc định KHÔNG từ chối client thiếu/sai subprotocol (chỉ không chọn subprotocol nào) → phải tự chặn ở đây.
    if (!handshake.protocols.has('ocpp1.6')) return reject(400, 'Subprotocol ocpp1.6 is required');
    // S-06: chỉ nhận mã trụ đã đăng ký; mã lấy từ ĐƯỜNG DẪN, không tin nội dung tin nhắn.
    if (!registered.has(handshake.identity)) {
      rejected.push({ identity: handshake.identity, ip: handshake.remoteAddress, protocols: handshake.protocols });
      return reject(404, 'Unknown charge point');
    }
    accept({ identity: handshake.identity });
  });

  server.on('client', (client) => {
    clients.set(client.identity, client);
    tap(client, { side: 'csms' });
    client.on('close', () => clients.delete(client.identity));

    client.handle('BootNotification', () => ({ status: 'Accepted', currentTime: new Date().toISOString(), interval: 300 }));
    client.handle('Heartbeat', () => ({ currentTime: new Date().toISOString() }));
    client.handle('StatusNotification', () => ({}));
    client.handle('Authorize', ({ params }) => ({ idTagInfo: { status: params.idTag === 'BLOCKED-TAG' ? 'Blocked' : 'Accepted' } }));
    client.handle('StartTransaction', ({ params }) => {
      const transactionId = nextTransactionId++;
      transactions.set(transactionId, { ...params, identity: client.identity, meter: [] });
      return { transactionId, idTagInfo: { status: 'Accepted' } };
    });
    client.handle('MeterValues', ({ params }) => { transactions.get(params.transactionId)?.meter.push(params.meterValue); return {}; });
    client.handle('StopTransaction', ({ params }) => {
      const tx = transactions.get(params.transactionId);
      if (tx) tx.stop = params;
      return { idTagInfo: { status: 'Accepted' } };
    });
  });

  return {
    server, clients, rejected, transactions,
    listen: (port) => server.listen(port),
    close: () => server.close({ awaitPending: false, force: true }),
    call: (identity, method, params) => clients.get(identity).call(method, params),
    mark,
  };
}

module.exports = { createServer };
