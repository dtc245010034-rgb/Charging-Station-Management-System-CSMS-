async function recordMeterValue(db, { sessionId, sampledAt, measurand, value, unit }) {
  const result = await db.query(
    `INSERT INTO meter_values (session_id, sampled_at, measurand, value, unit, raw_unit)
     VALUES ($1, $2, $3, $4, $5, $5)
     RETURNING id, session_id, sampled_at, measurand, value, COALESCE(raw_unit, unit) AS unit`,
    [sessionId, sampledAt, measurand, value, unit]
  );
  return result.rows[0];
}

async function recordMeterValues(db, sessionId, meterValues) {
  if (meterValues.length === 0) return;

  const values = [];
  const rows = meterValues.map((meterValue, index) => {
    const offset = index * 5;
    values.push(
      sessionId,
      meterValue.sampledAt,
      meterValue.measurand,
      meterValue.value,
      meterValue.unit
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 5})`;
  });

  await db.query(
    `INSERT INTO meter_values (session_id, sampled_at, measurand, value, unit, raw_unit)
     VALUES ${rows.join(', ')}
     ON CONFLICT (session_id, measurand, sampled_at) DO NOTHING`,
    values
  );
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

function meterValueToWh({ value, unit }) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new TypeError('meter value must be a finite number');
  }
  if (unit !== 'Wh' && unit !== 'kWh') {
    throw new TypeError(`Unsupported meter value unit: ${unit}`);
  }
  return unit === 'kWh' ? numericValue * 1000 : numericValue;
}

module.exports = { recordMeterValue, recordMeterValues, findLatestMeterValue, meterValueToWh };
