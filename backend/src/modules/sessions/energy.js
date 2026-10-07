function coerceNonNegativeSafeInteger(val, paramName) {
  let num;
  if (typeof val === 'number') {
    num = val;
  } else if (typeof val === 'bigint') {
    num = Number(val);
  } else if (typeof val === 'string' && /^\d+$/.test(val.trim())) {
    num = Number(val.trim());
  } else {
    throw new TypeError(`${paramName} must be a non-negative safe integer`);
  }

  if (!Number.isSafeInteger(num) || num < 0) {
    throw new TypeError(`${paramName} must be a non-negative safe integer`);
  }
  return num;
}

function calculateEnergyKwh(meterStartWh, meterStopWh) {
  const start = coerceNonNegativeSafeInteger(meterStartWh, 'meterStartWh');
  if (meterStopWh === null || meterStopWh === undefined) {
    return null;
  }
  const stop = coerceNonNegativeSafeInteger(meterStopWh, 'meterStopWh');

  const energyWh = stop - start;
  return energyWh < 0 ? null : energyWh / 1000;
}

module.exports = { calculateEnergyKwh };

