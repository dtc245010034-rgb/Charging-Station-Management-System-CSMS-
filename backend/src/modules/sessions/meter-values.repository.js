const { parseToScaledBigInt, normalizeUnit } = require('./meter-rules');

async function recordMeterValue(db, {
  sessionId,
  reportedAt,
  sampledAt,
  measurand,
  value,
  unit,
  phase,
  context,
  sourceMessageId,
}) {
  const result = await db.query(
    `INSERT INTO meter_values (
       session_id, reported_at, sampled_at, measurand, value, unit, raw_unit, phase, context, source_message_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)
     ON CONFLICT (session_id, reported_at, measurand, phase, context) DO NOTHING
     RETURNING id, session_id, reported_at, sampled_at, measurand, value, COALESCE(raw_unit, unit) AS unit`,
    [sessionId, reportedAt, sampledAt, measurand, value, unit, phase, context, sourceMessageId]
  );
  return result.rows[0];
}

async function recordMeterValues(db, sessionId, meterValues) {
  if (meterValues.length === 0) return;

  const values = [];
  const rows = meterValues.map((meterValue, index) => {
    const offset = index * 10;
    values.push(
      sessionId,
      meterValue.reportedAt,
      meterValue.sampledAt,
      meterValue.measurand,
      meterValue.value,
      meterValue.unit,
      meterValue.unit,
      meterValue.phase,
      meterValue.context,
      meterValue.sourceMessageId
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`;
  });

  await db.query(
    `INSERT INTO meter_values (
       session_id, reported_at, sampled_at, measurand, value, unit, raw_unit, phase, context, source_message_id
     ) VALUES ${rows.join(', ')}
     ON CONFLICT (session_id, reported_at, measurand, phase, context) DO NOTHING`,
    values
  );
}

async function findLatestMeterValues(db, sessionId) {
  const result = await db.query(
    `SELECT DISTINCT ON (measurand, phase, context)
       measurand, phase, context, sampled_at, value, COALESCE(raw_unit, unit) AS unit
     FROM meter_values
     WHERE session_id = $1
       AND reported_at = sampled_at
     ORDER BY measurand, phase, context, sampled_at DESC, id DESC`,
    [sessionId]
  );
  return result.rows;
}

async function findLatestMeterValue(db, sessionId) {
  const result = await db.query(
    `SELECT id, session_id, sampled_at, measurand, value, COALESCE(raw_unit, unit) AS unit
     FROM meter_values
     WHERE session_id = $1
     ORDER BY sampled_at DESC, id DESC
     LIMIT 1`,
    [sessionId]
  );
  return result.rows[0] || null;
}

/**
 * Chuyển đổi số đo Wh hoặc kWh sang đơn vị Wh nguyên, không bị sai số dấu phẩy động.
 * @param {{value: string|number, unit: string}} param0 - Đối tượng số đo và đơn vị
 * @returns {number} - Giá trị số đo tính theo Wh
 */
function meterValueToWh({ value, unit }) {
  const normUnit = normalizeUnit(unit);
  if (normUnit !== 'Wh' && normUnit !== 'kWh') {
    throw new TypeError(`Unsupported meter value unit: ${unit}`);
  }
  try {
    const whBigInt = normUnit === 'kWh'
      ? parseToScaledBigInt(value, 3)
      : parseToScaledBigInt(value, 0);
    const num = Number(whBigInt);
    if (!Number.isFinite(num)) {
      throw new TypeError('meter value must be a finite number');
    }
    return num;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new TypeError('meter value must be a finite number');
    }
    throw err;
  }
}

module.exports = {
  recordMeterValue,
  recordMeterValues,
  findLatestMeterValues,
  findLatestMeterValue,
  meterValueToWh,
};
