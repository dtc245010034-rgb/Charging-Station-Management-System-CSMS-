// Ghi lại MỌI khung OCPP-J theo chiều (Trụ→CSMS hay CSMS→Trụ) để làm bản ghi của spike.
const log = [];
const t0 = Date.now();

function record(direction, identity, raw) {
  let frame;
  try { frame = JSON.parse(String(raw)); } catch { frame = String(raw); }
  log.push({ t: Date.now() - t0, direction, identity, frame });
}

// Hook vào một RPCClient (phía trụ) hoặc server-client (phía CSMS): 'message' phát ra cho cả hai chiều.
function tap(client, { side }) {
  client.on('message', ({ message, outbound }) => {
    const toCsms = side === 'chargepoint' ? outbound : !outbound;
    // Mỗi khung thấy ở cả hai đầu; chỉ ghi ở phía CSMS để không nhân đôi.
    if (side === 'csms') record(toCsms ? 'CP→CSMS' : 'CSMS→CP', client.identity, message);
  });
}

module.exports = { log, record, tap, mark: (note) => log.push({ t: Date.now() - t0, note }) };
