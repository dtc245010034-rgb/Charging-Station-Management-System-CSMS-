// Trụ sạc ảo dựng bằng ocpp-rpc RPCClient (strictMode): độc lập với mã CSMS của nhóm, tự kiểm schema OCPP 1.6.
const { RPCClient } = require('ocpp-rpc');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class VirtualChargePoint {
  constructor({ endpoint, identity, protocols = ['ocpp1.6'], maxKw = 22 }) {
    this.identity = identity;
    this.maxKw = maxKw;
    this.limitKw = maxKw; // R-08: SetChargingProfile hạ giá trị này
    this.profiles = [];
    this.meterWh = 0;
    this.transactionId = null;
    this.resets = 0;
    this.client = new RPCClient({ endpoint, identity, protocols, strictMode: true, reconnect: true, maxReconnects: 3, backoff: { initialDelay: 50, maxDelay: 200 } });

    this.client.handle('Reset', async ({ params }) => { this.resets += 1; this.lastReset = params; return { status: 'Accepted' }; });
    this.client.handle('SetChargingProfile', ({ params }) => {
      this.profiles.push(params);
      const limit = params.csChargingProfiles?.chargingSchedule?.chargingSchedulePeriod?.[0]?.limit;
      const unit = params.csChargingProfiles?.chargingSchedule?.chargingRateUnit;
      if (Number.isFinite(limit)) this.limitKw = Math.min(this.maxKw, unit === 'W' ? limit / 1000 : (limit * 230 * 3) / 1000);
      return { status: 'Accepted' };
    });
    this.client.handle('RemoteStopTransaction', ({ params }) => ({ status: params.transactionId === this.transactionId ? 'Accepted' : 'Rejected' }));
  }

  connect() { return this.client.connect(); }
  close() { return this.client.close({ awaitPending: false, force: true }); }
  call(method, params) { return this.client.call(method, params); }

  boot() { return this.call('BootNotification', { chargePointVendor: 'CSMS-Spike', chargePointModel: 'K01-Virtual', chargePointSerialNumber: this.identity, firmwareVersion: '0.1.0' }); }
  status(connectorId, status, errorCode = 'NoError') { return this.call('StatusNotification', { connectorId, status, errorCode, timestamp: new Date().toISOString() }); }

  async startCharging({ connectorId = 1, idTag = 'DEMO-TAG-001' } = {}) {
    await this.call('Authorize', { idTag });
    await this.status(connectorId, 'Preparing');
    const { transactionId, idTagInfo } = await this.call('StartTransaction', { connectorId, idTag, meterStart: this.meterWh, timestamp: new Date().toISOString() });
    this.transactionId = transactionId;
    this.idTag = idTag;
    this.connectorId = connectorId;
    await this.status(connectorId, 'Charging');
    return { transactionId, idTagInfo };
  }

  // Mỗi mẫu tăng năng lượng theo công suất hiện hành (bị giới hạn bởi profile nếu có).
  async sendMeter(seconds = 10) {
    this.meterWh += Math.round(this.limitKw * 1000 * (seconds / 3600));
    const now = new Date().toISOString();
    return this.call('MeterValues', {
      connectorId: this.connectorId, transactionId: this.transactionId,
      meterValue: [{ timestamp: now, sampledValue: [
        { value: String(this.meterWh), context: 'Sample.Periodic', measurand: 'Energy.Active.Import.Register', unit: 'Wh' },
        { value: String(Math.round(this.limitKw * 1000)), measurand: 'Power.Active.Import', unit: 'W' },
        { value: (this.limitKw * 1000 / 230 / 3).toFixed(1), measurand: 'Current.Import', unit: 'A' },
      ] }],
    });
  }

  async stopCharging({ reason = 'Local' } = {}) {
    const result = await this.call('StopTransaction', { transactionId: this.transactionId, idTag: this.idTag, meterStop: this.meterWh, timestamp: new Date().toISOString(), reason });
    await this.status(this.connectorId, 'Finishing');
    await this.status(this.connectorId, 'Available');
    this.transactionId = null;
    return result;
  }
}

module.exports = { VirtualChargePoint, sleep };
