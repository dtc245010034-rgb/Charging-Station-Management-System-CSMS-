const ENERGY_MEASURAND = 'Energy.Active.Import.Register';
const DECIMAL_VALUE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/;
const MAX_DECIMAL_VALUE_LENGTH = 128;
const MAX_DECIMAL_EXPONENT = 1000;

function isValidMeterDecimal(value) {
  if (typeof value !== 'string' || value.length > MAX_DECIMAL_VALUE_LENGTH) return false;
  const match = DECIMAL_VALUE.exec(value);
  if (!match) return false;
  const exponent = Number(match[1] || 0);
  return Number.isSafeInteger(exponent)
    && Math.abs(exponent) <= MAX_DECIMAL_EXPONENT
    && Number.isFinite(Number(value));
}

function decimalParts(value) {
  if (!isValidMeterDecimal(String(value))) {
    throw new TypeError('meter value must be a decimal number');
  }
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(String(value));

  const sign = match[1] === '-' ? -1 : 1;
  let digits = `${match[2]}${match[3] || ''}`.replace(/^0+/, '') || '0';
  let scale = (match[3] || '').length - Number(match[4] || 0);

  if (scale < 0) {
    digits += '0'.repeat(-scale);
    scale = 0;
  }
  while (scale > 0 && digits.length > 1 && digits.endsWith('0')) {
    digits = digits.slice(0, -1);
    scale -= 1;
  }

  return { sign: digits === '0' ? 0 : sign, coefficient: BigInt(digits), scale };
}

function compareDecimals(left, right) {
  const a = decimalParts(left);
  const b = decimalParts(right);
  if (a.sign !== b.sign) return Math.sign(a.sign - b.sign);
  if (a.sign === 0) return 0;

  const scale = Math.max(a.scale, b.scale);
  const leftValue = a.coefficient * (10n ** BigInt(scale - a.scale));
  const rightValue = b.coefficient * (10n ** BigInt(scale - b.scale));
  if (leftValue === rightValue) return 0;
  return (leftValue < rightValue ? -1 : 1) * a.sign;
}

function compareMeasurements(previous, current) {
  const previousUnit = previous.unit || 'Wh';
  const currentUnit = current.unit || 'Wh';

  if (previous.measurand === ENERGY_MEASURAND
    && current.measurand === ENERGY_MEASURAND
    && ['Wh', 'kWh'].includes(previousUnit)
    && ['Wh', 'kWh'].includes(currentUnit)) {
    const previousValue = decimalParts(previous.value);
    const currentValue = decimalParts(current.value);
    if (previousUnit === 'kWh') previousValue.coefficient *= 1000n;
    if (currentUnit === 'kWh') currentValue.coefficient *= 1000n;
    const scale = Math.max(previousValue.scale, currentValue.scale);
    const left = previousValue.coefficient * (10n ** BigInt(scale - previousValue.scale));
    const right = currentValue.coefficient * (10n ** BigInt(scale - currentValue.scale));
    if (previousValue.sign !== currentValue.sign) {
      return Math.sign(currentValue.sign - previousValue.sign);
    }
    if (left === right) return 0;
    return (right < left ? -1 : 1) * previousValue.sign;
  }

  if (previousUnit !== currentUnit) return null;
  return compareDecimals(current.value, previous.value);
}

function evaluateMeterReading(previous, current) {
  if (current.clockSkew) return { action: 'save' };
  if (!previous) return { action: 'save' };

  const previousAt = Date.parse(previous.sampled_at || previous.sampledAt);
  const currentAt = Date.parse(current.sampledAt);
  if (currentAt < previousAt) return { action: 'ignore', reason: 'OLDER_TIMESTAMP' };

  const comparison = compareMeasurements(previous, current);
  if (currentAt === previousAt) {
    return comparison === 0
      ? { action: 'ignore', reason: 'DUPLICATE' }
      : { action: 'ignore', reason: 'CONFLICTING_TIMESTAMP' };
  }

  if (comparison !== null && comparison < 0) {
    return { action: 'review', reason: 'METER_VALUE_DECREASE' };
  }
  return { action: 'save' };
}

module.exports = { evaluateMeterReading, isValidMeterDecimal };
