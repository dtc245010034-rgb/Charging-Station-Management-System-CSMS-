const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const { Client } = createRequire(path.join(__dirname, '..', 'backend', 'package.json'))('pg');
const fixtures = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'backend', 'tests', 'fixtures', 'billing', 'hand-cases.json'),
  'utf8'
));

function fixture(id) {
  const found = fixtures.find((item) => item.id === id);
  if (!found) throw new Error(`Thiếu ca tính tiền ${id}`);
  return found;
}

function replaceDate(value, date) {
  return `${date}${value.slice(10, 19)}Z`;
}

async function findOrCreateUser(client, name, email) {
  const result = await client.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, 'seed-account-disabled')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name, email]
  );
  return result.rows[0].id;
}

async function findOrCreateSession(client, {
  chargePointId,
  connectorId,
  driverId,
  caseId,
  input,
  date,
  meterStart = input.meterStartWh,
  meterStop = input.meterStopWh,
  billingStatus = 'FINAL',
}) {
  const startedAt = replaceDate(input.startedAt, date);
  const stoppedAt = replaceDate(input.stoppedAt, date);
  const existing = await client.query(
    `SELECT id
     FROM charging_sessions
     WHERE charge_point_id = $1 AND connector_no = $2 AND id_tag_masked = $3
       AND meter_start = $4 AND started_at = $5::timestamptz`,
    [chargePointId, caseId === 'C02' || caseId === 'C17' ? 2 : 1, `RECON-DEMO-${caseId}`, meterStart, startedAt]
  );
  if (existing.rowCount) return existing.rows[0].id;
  const connectorNo = caseId === 'C02' || caseId === 'C17' ? 2 : 1;
  const result = await client.query(
    `INSERT INTO charging_sessions (
       charge_point_id, connector_id, connector_no, driver_id, id_tag_masked,
       meter_start, meter_stop, started_at, stopped_at, status, billing_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED', $10)
     RETURNING id`,
    [chargePointId, connectorId, connectorNo, driverId, `RECON-DEMO-${caseId}`, meterStart, meterStop, startedAt, stoppedAt, billingStatus]
  );
  return result.rows[0].id;
}

async function findOrCreateTariff(client, stationId, version, tariff) {
  const existing = await client.query(
    'SELECT id FROM tariffs WHERE station_id = $1 AND version = $2',
    [stationId, version]
  );
  if (existing.rowCount) return existing.rows[0].id;
  const inserted = await client.query(
    `INSERT INTO tariffs (station_id, version, effective_from, idle_grace_min, idle_per_min_dong)
     VALUES ($1, $2, $3::date, $4, $5)
     RETURNING id`,
    [stationId, version, version === 1 ? '2000-01-01' : '2000-01-02', tariff.idle.graceMin, tariff.idle.perMinDong]
  );
  const tariffId = inserted.rows[0].id;
  for (const period of tariff.periods) {
    await client.query(
      `INSERT INTO tariff_periods (tariff_id, start_minute, end_minute, price_per_kwh_dong, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [tariffId, period.startMin, period.endMin, period.pricePerKwh, period.label || null]
    );
  }
  return tariffId;
}

async function addInvoice(client, {
  sessionId,
  driverId,
  stationId,
  tariffId,
  tariff,
  date,
  totalDong,
  lines,
}) {
  const existing = await client.query('SELECT id FROM session_invoices WHERE session_id = $1', [sessionId]);
  if (existing.rowCount) return existing.rows[0].id;
  const invoice = await client.query(
    `INSERT INTO session_invoices (
       session_id, driver_id, station_id, tariff_id, tariff_snapshot, timezone, total_dong, period_date
     ) VALUES ($1, $2, $3, $4, $5::jsonb, 'Asia/Ho_Chi_Minh', $6, $7::date)
     RETURNING id`,
    [sessionId, driverId, stationId, tariffId, JSON.stringify(tariff), totalDong, date]
  );
  for (const [index, line] of lines.entries()) {
    await client.query(
      `INSERT INTO invoice_lines (
         invoice_id, seq, kind, local_date, from_at, to_at, wh,
         price_per_kwh, minutes, per_min_dong, amount_dong
       ) VALUES ($1, $2, $3, $4::date, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11)
       ON CONFLICT (invoice_id, seq) DO NOTHING`,
      [
        invoice.rows[0].id,
        index + 1,
        line.kind,
        date,
        replaceDate(line.from, date),
        replaceDate(line.to, date),
        line.wh,
        line.pricePerKwh,
        line.minutes || null,
        line.perMinDong || null,
        line.amountDong,
      ]
    );
  }
  return invoice.rows[0].id;
}

async function addLedger(client, { driverId, sessionId, amount, date }) {
  await client.query(
    `INSERT INTO wallet_ledger (driver_id, entry_type, amount_dong, balance_after_dong, session_id, period_date)
     VALUES ($1, 'SESSION_DEBIT', $2, $2, $3, $4::date)
     ON CONFLICT DO NOTHING`,
    [driverId, String(-amount), sessionId, date]
  );
}

async function seed() {
  const connectionString = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error('Cần DATABASE_URL hoặc TEST_DATABASE_URL');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    const dateResult = await client.query(
      "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS local_date"
    );
    const date = dateResult.rows[0].local_date;
    const ownerId = await findOrCreateUser(client, 'Chủ trạm demo đối soát', 'reconciliation-owner@demo.invalid');
    const driverId = await findOrCreateUser(client, 'Tài xế demo đối soát', 'reconciliation-driver@demo.invalid');
    const stationResult = await client.query(
      `SELECT id FROM stations WHERE owner_id = $1 AND name = 'Trạm demo đối soát' LIMIT 1`,
      [ownerId]
    );
    const stationId = stationResult.rowCount ? stationResult.rows[0].id : (await client.query(
      `INSERT INTO stations (name, address, owner_id, status, timezone)
       VALUES ('Trạm demo đối soát', 'Địa chỉ giả', $1, 'ACTIVE', 'Asia/Ho_Chi_Minh')
       RETURNING id`,
      [ownerId]
    )).rows[0].id;
    const pointResult = await client.query(
      `INSERT INTO charge_points (station_id, code, status)
       VALUES ($1, 'RECON-DEMO-CP', 'ONLINE')
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
      [stationId]
    );
    const existingPoint = pointResult.rowCount ? null : await client.query(
      "SELECT id, station_id FROM charge_points WHERE code = 'RECON-DEMO-CP'"
    );
    if (existingPoint && String(existingPoint.rows[0].station_id) !== String(stationId)) {
      throw new Error('RECON-DEMO-CP đã được gắn với trạm khác');
    }
    const pointId = pointResult.rowCount ? pointResult.rows[0].id : existingPoint.rows[0].id;
    const connectorIds = [];
    for (const connectorNo of [1, 2]) {
      const connector = await client.query(
        `INSERT INTO connectors (charge_point_id, connector_no, status)
         VALUES ($1, $2, 'AVAILABLE')
         ON CONFLICT (charge_point_id, connector_no) DO NOTHING
         RETURNING id`,
        [pointId, connectorNo]
      );
      const existingConnector = connector.rowCount ? null : await client.query(
        'SELECT id FROM connectors WHERE charge_point_id = $1 AND connector_no = $2',
        [pointId, connectorNo]
      );
      connectorIds.push(connector.rowCount ? connector.rows[0].id : existingConnector.rows[0].id);
    }
    const cases = [
      { id: 'C01', connector: 0 },
      { id: 'C14', connector: 0 },
      { id: 'C02', connector: 1 },
      { id: 'C17', connector: 1 },
    ];
    for (const item of cases) {
      const billingCase = fixture(item.id);
      const tariffId = await findOrCreateTariff(client, stationId, item.connector === 0 ? 1 : 2, billingCase.input.tariff);
      const sessionId = await findOrCreateSession(client, {
        chargePointId: pointId,
        connectorId: connectorIds[item.connector],
        driverId,
        caseId: item.id,
        input: billingCase.input,
        date,
      });
      await addInvoice(client, {
        sessionId,
        driverId,
        stationId,
        tariffId,
        tariff: billingCase.input.tariff,
        date,
        totalDong: billingCase.expected.totalDong,
        lines: billingCase.expected.lines,
      });
      await addLedger(client, { driverId, sessionId, amount: billingCase.expected.totalDong, date });
    }

    for (const item of [
      { id: 'X1', caseId: 'C01', invoice: false, meterStop: 5000, billingStatus: null },
      { id: 'X2', caseId: 'C01', invoice: true, totalDong: 40000, ledger: null },
      { id: 'X3', caseId: 'C01', invoice: true, totalDong: 40001, ledger: -40001 },
      { id: 'X4', caseId: 'C01', invoice: true, totalDong: 40000, ledger: -39999 },
      { id: 'X5', caseId: 'C01', invoice: true, totalDong: 40000, billedWh: 9999, ledger: -40000 },
    ]) {
      const billingCase = fixture(item.caseId);
      const sessionId = await findOrCreateSession(client, {
        chargePointId: pointId,
        connectorId: connectorIds[0],
        driverId,
        caseId: item.id,
        input: billingCase.input,
        date,
        meterStop: item.meterStop ?? billingCase.input.meterStopWh,
        billingStatus: item.billingStatus === undefined ? 'FINAL' : item.billingStatus,
      });
      if (item.invoice) {
        const tariffId = await findOrCreateTariff(client, stationId, 1, billingCase.input.tariff);
        const lines = billingCase.expected.lines.map((line) => ({
          ...line,
          wh: item.billedWh ?? line.wh,
          amountDong: item.billedWh ? 39996 : line.amountDong,
        }));
        await addInvoice(client, {
          sessionId,
          driverId,
          stationId,
          tariffId,
          tariff: billingCase.input.tariff,
          date,
          totalDong: item.totalDong,
          lines,
        });
      }
      if (item.ledger !== null && item.ledger !== undefined) {
        await addLedger(client, { driverId, sessionId, amount: -item.ledger, date });
      }
    }
    await client.query('INSERT INTO wallets (driver_id) VALUES ($1) ON CONFLICT (driver_id) DO NOTHING', [driverId]);
    await client.query('COMMIT');
    console.log(`Dữ liệu demo đối soát đã sẵn sàng cho kỳ ${date}.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error(`Không thể tạo dữ liệu demo đối soát: ${error.message}`);
  process.exitCode = 1;
});
