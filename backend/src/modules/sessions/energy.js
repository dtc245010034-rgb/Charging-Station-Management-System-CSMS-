function calculateEnergyKwh(meterStartWh, meterStopWh) {
  if (!Number.isSafeInteger(meterStartWh) || meterStartWh < 0) {
    throw new TypeError('meterStartWh must be a non-negative safe integer');
  }
  if (!Number.isSafeInteger(meterStopWh) || meterStopWh < 0) {
    throw new TypeError('meterStopWh must be a non-negative safe integer');
  }

  const energyWh = meterStopWh - meterStartWh;
  return energyWh < 0 ? null : energyWh / 1000;
}

module.exports = { calculateEnergyKwh };
