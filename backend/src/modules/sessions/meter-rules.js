const ENERGY_MEASURAND = 'Energy.Active.Import.Register';
const DECIMAL_VALUE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/;
const MAX_DECIMAL_VALUE_LENGTH = 128;
const MAX_STORED_DECIMAL_LENGTH = 4096;
const MAX_DECIMAL_EXPONENT = 1000;
const MIN_METER_VALUE = '0.000000000001';
const MAX_METER_VALUE = '1000000000000';

function isValidMeterDecimal(value) {
  if (typeof value !== 'string' || value.length > MAX_DECIMAL_VALUE_LENGTH) return false;
  const match = DECIMAL_VALUE.exec(value);
  if (!match) return false;
  const exponent = Number(match[1] || 0);
  return Number.isSafeInteger(exponent)
    && Math.abs(exponent) <= MAX_DECIMAL_EXPONENT
    && Number.isFinite(Number(value));
}

function isPlausibleMeterValue(value, measurand, unit) {
  if (!isValidMeterDecimal(value)) return false;
  const parts = decimalParts(value);
  if (parts.sign < 0) return false;
  if (parts.sign !== 0 && compareDecimals(value, MIN_METER_VALUE) < 0) return false;

  const maximum = measurand === ENERGY_MEASURAND && unit === 'kWh'
    ? '1000000000'
    : MAX_METER_VALUE;
  return compareDecimals(value, maximum) <= 0;
}

function decimalParts(value) {
  const text = String(value);
  if (text.length > MAX_STORED_DECIMAL_LENGTH || !DECIMAL_VALUE.test(text)) {
    throw new TypeError('meter value must be a decimal number');
  }
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  const exponent = Number(match[4] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_DECIMAL_EXPONENT) {
    throw new TypeError('meter value must be a decimal number');
  }

  const sign = match[1] === '-' ? -1 : 1;
  let digits = `${match[2]}${match[3] || ''}`.replace(/^0+/, '') || '0';
  let scale = (match[3] || '').length - exponent;

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

function parseToScaledBigInt(value, targetScale = 0) {
  const parts = decimalParts(value);
  const scaleDiff = targetScale - parts.scale;
  if (scaleDiff < 0) {
    const divisor = 10n ** BigInt(-scaleDiff);
    return (parts.coefficient / divisor) * BigInt(parts.sign);
  }
  const factor = 10n ** BigInt(scaleDiff);
  return parts.coefficient * factor * BigInt(parts.sign);
}

function normalizeUnit(unit) {
  if (typeof unit !== 'string') return unit;
  const trimmed = unit.trim();
  const upper = trimmed.toUpperCase();
  if (upper === 'KWH') return 'kWh';
  if (upper === 'WH') return 'Wh';
  return trimmed;
}

function toEpochMs(timestamp) {
  if (timestamp instanceof Date) return timestamp.getTime();
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
  if (typeof timestamp === 'string') return Date.parse(timestamp);
  return NaN;
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
    if (current.measurand === ENERGY_MEASURAND) {
      return { action: 'review', reason: 'METER_VALUE_DECREASE' };
    }
  }
  return { action: 'save' };
}

module.exports = {
  evaluateMeterReading,
  isPlausibleMeterValue,
  isValidMeterDecimal,
};
