const { once } = require('node:events');
const { WebSocket } = require('ws');

const [endpoint, identity] = process.argv.slice(2);
let sequence = 0;

async function main() {
  const client = new WebSocket(`${endpoint}/ocpp/${encodeURIComponent(identity)}`, ['ocpp1.6']);
  await once(client, 'open');

  async function call(action, payload) {
    const messageId = `virtual-${++sequence}`;
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.off('message', onMessage);
        reject(new Error(`Timed out waiting for ${action}`));
      }, 10000);
      const onMessage = (raw) => {
        const frame = JSON.parse(raw.toString());
        if (frame[1] !== messageId) return;
        clearTimeout(timeout);
        client.off('message', onMessage);
        if (frame[0] === 4) reject(new Error(`${frame[2]}: ${frame[3]}`));
        else resolve(frame[2]);
      };
      client.on('message', onMessage);
    });
    client.send(JSON.stringify([2, messageId, action, payload]));
    return response;
  }

  try {
    const boot = await call('BootNotification', {
      chargePointVendor: 'CSMS-CI',
      chargePointModel: 'Virtual-Heartbeat',
    });
    if (boot.status !== 'Accepted') throw new Error(`BootNotification was ${boot.status}`);

    const skewHours = Number(process.env.SIMULATED_CLOCK_SKEW_HOURS || 0);
    const simulatedChargePointTime = new Date(Date.now() + skewHours * 60 * 60 * 1000).toISOString();
    await call('StatusNotification', {
      connectorId: 1,
      errorCode: 'NoError',
      status: 'Available',
      timestamp: simulatedChargePointTime,
    });

    const heartbeat = await call('Heartbeat', {});
    process.stdout.write(`${JSON.stringify({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
      simulatedChargePointTime,
      heartbeatTime: heartbeat.currentTime,
    })}\n`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
