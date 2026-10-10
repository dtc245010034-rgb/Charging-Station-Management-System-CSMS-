const { parseToScaledBigInt } = require('./meter-rules');

// Đổi mọi đại lượng về đơn vị nhỏ nhất (mWh, mW) bằng BigInt để cộng trừ không trôi số thực.
// 1 Wh = 10^3 mWh; 1 kWh = 10^6 mWh. 1 W = 10^3 mW; 1 kW = 10^6 mW.
const ENERGY_SCALE_BY_UNIT = { WH: 3, KWH: 6 };
const POWER_SCALE_BY_UNIT = { W: 3, KW: 6 };

function scaledReading(value, unit, scaleByUnit, defaultUnit) {
  if (value === null || value === undefined) return null;
  const scale = scaleByUnit[String(unit || defaultUnit).trim().toUpperCase()];
  if (scale === undefined) return null;
  try {
    return parseToScaledBigInt(String(value), scale);
  } catch {
    return null;
  }
}

function toNumberOrNull(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// meterStartWh: mốc công tơ lúc bắt đầu, luôn tính bằng Wh (OCPP StartTransaction.meterStart).
function liveEnergyKwh(meterStartWh, value, unit) {
  const start = scaledReading(meterStartWh, 'Wh', ENERGY_SCALE_BY_UNIT, 'Wh');
  const latest = scaledReading(value, unit, ENERGY_SCALE_BY_UNIT, 'Wh');
  if (start === null || latest === null) return null;
  const delta = latest - start;
  return delta < 0n ? null : Number(delta) / 1e6;
}

function powerToWatts(value, unit) {
  const milliwatts = scaledReading(value, unit, POWER_SCALE_BY_UNIT, 'W');
  return milliwatts === null ? null : Number(milliwatts) / 1000;
}

module.exports = { liveEnergyKwh, powerToWatts, toNumberOrNull };
