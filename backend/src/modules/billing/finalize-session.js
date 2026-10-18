const { withTransaction } = require('../../db/tx');
const { sanitizeErrorMessage } = require('../../lib/constants');
const { listEnergySamples } = require('../sessions/meter-values.repository');
const { fetchConnectorStatusEvents, resolveIdleInterval } = require('./resolve-idle-interval');
const { priceSession } = require('./price-session');
const { findEffectiveTariff } = require('./tariffs.repository');
const { toLocalParts } = require('./tz');

const afterInvoiceHooks = new Map();

function registerAfterInvoice(name, fn) {
  if (typeof name === 'function') {
    fn = name;
    name = Symbol('after-invoice');
  }
  if (typeof name !== 'string' && typeof name !== 'symbol') {
    throw new TypeError('after-invoice hook name must be a string or symbol');
  }
  if (typeof fn !== 'function') throw new TypeError('after-invoice hook must be a function');
  afterInvoiceHooks.set(name, fn);
  return () => {
    if (afterInvoiceHooks.get(name) === fn) afterInvoiceHooks.delete(name);
  };
}

function idleMaxWaitMinutes(override) {
  const value = override ?? require('../../config/env').IDLE_MAX_WAIT_MIN;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('IDLE_MAX_WAIT_MIN must be a positive integer');
  }
  return value;
}

function formatInvoice(invoice, lines) {
  return {
    id: invoice.id,
    sessionId: invoice.session_id,
    driverId: invoice.driver_id,
    stationId: invoice.station_id,
    tariffId: invoice.tariff_id,
    tariffSnapshot: invoice.tariff_snapshot,
    timezone: invoice.timezone,
    roundingRule: invoice.rounding_rule,
    totalDong: invoice.total_dong,
    periodDate: invoice.period_date,
    issuedAt: invoice.issued_at,
    lines: lines.map((line) => ({
      seq: line.seq,
      kind: line.kind,
      localDate: line.local_date,
      from: line.from_at,
      to: line.to_at,
      wh: line.wh,
      pricePerKwh: line.price_per_kwh,
      minutes: line.minutes,
      perMinDong: line.per_min_dong,
      amountDong: line.amount_dong,
    })),
  };
}

async function findInvoice(client, sessionId) {
  const invoiceResult = await client.query(
    'SELECT * FROM session_invoices WHERE session_id = $1',
    [sessionId]
  );
  if (!invoiceResult.rows[0]) return null;
  const lineResult = await client.query(
    'SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY seq',
    [invoiceResult.rows[0].id]
  );
  return formatInvoice(invoiceResult.rows[0], lineResult.rows);
}

async function markError(sessionId, poolInstance, error, logError) {
  const database = poolInstance || require('../../db/pool').pool;
  const periodClosed = error?.code === '55000' && error?.message?.includes('PERIOD_CLOSED');
  const billingReason = periodClosed ? 'PERIOD_CLOSED' : 'FINALIZATION_FAILED';
  try {
    await database.query(
      `UPDATE charging_sessions
       SET billing_status = 'ERROR',
           billing_reason = $2,
           billing_attempts = billing_attempts + 1,
           billing_next_at = CASE WHEN $2 = 'PERIOD_CLOSED' THEN NULL ELSE
             CURRENT_TIMESTAMP
               + make_interval(secs => LEAST(600, 30 * (1 << LEAST(billing_attempts + 1, 5))))
             END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'COMPLETED'
         AND NOT EXISTS (SELECT 1 FROM session_invoices WHERE session_id = $1)`,
      [sessionId, billingReason]
    );
  } catch (updateError) {
    logError(
      `[Billing] Không thể ghi trạng thái ERROR cho phiên ${sessionId}:`,
      sanitizeErrorMessage(updateError?.message || updateError)
    );
  }
  if (periodClosed) {
    try {
      await require('../audit/audit.repository').record(
        null,
        'BILLING_PERIOD_CLOSED',
        'charging_session',
        sessionId,
        { reason: 'PERIOD_CLOSED' },
        null,
        database
      );
    } catch (auditError) {
      logError(
        `[Billing] Không thể ghi audit kỳ đã chốt cho phiên ${sessionId}:`,
        sanitizeErrorMessage(auditError?.message || auditError)
      );
    }
  }
  logError(
    `[Billing] Không thể lập hóa đơn cho phiên ${sessionId}:`,
    sanitizeErrorMessage(error?.message || error)
  );
}

async function finalizeInTransaction(client, sessionId, now, maxWaitMinutes) {
  const sessionResult = await client.query(
    `SELECT cs.id, cs.status, cs.billing_status, cs.needs_review, cs.driver_id,
            cs.meter_start, cs.meter_stop, cs.started_at, cs.stopped_at,
            cs.connector_id, cp.station_id, s.timezone
     FROM charging_sessions cs
     JOIN connectors c ON c.id = cs.connector_id
     JOIN charge_points cp ON cp.id = cs.charge_point_id
     JOIN stations s ON s.id = cp.station_id
     WHERE cs.id = $1
     FOR UPDATE OF cs`,
    [sessionId]
  );
  const session = sessionResult.rows[0];
  if (!session) return { status: 'NOT_FOUND' };

  const existing = await findInvoice(client, sessionId);
  if (existing) return { status: 'FINAL', invoice: existing };
  if (session.status !== 'COMPLETED') return { status: 'IGNORED' };
  if (session.billing_status === 'SKIPPED') return { status: 'SKIPPED' };
  if (session.meter_stop === null || session.stopped_at === null) {
    throw new Error('Completed session is missing stop meter data');
  }

  if (session.needs_review) {
    await client.query(
      `UPDATE charging_sessions
       SET billing_status = 'REVIEW', billing_reason = 'NEEDS_REVIEW',
           billing_next_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );
    return { status: 'REVIEW', reason: 'NEEDS_REVIEW' };
  }

  const tariff = await findEffectiveTariff(client, session.station_id, session.started_at);
  if (!tariff) {
    await client.query(
      `UPDATE charging_sessions
       SET billing_status = 'REVIEW', billing_reason = 'NO_TARIFF',
           billing_next_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );
    return { status: 'REVIEW', reason: 'NO_TARIFF' };
  }
  if (!session.driver_id) {
    await client.query(
      `UPDATE charging_sessions
       SET billing_status = 'REVIEW', billing_reason = 'NO_DRIVER',
           billing_next_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );
    return { status: 'REVIEW', reason: 'NO_DRIVER' };
  }

  let idleInterval;
  let billingReason = null;
  if (Number(tariff.idle.perMinDong) > 0) {
    const events = await fetchConnectorStatusEvents(client, session.connector_id);
    const resolved = resolveIdleInterval(events, {
      stoppedAt: session.stopped_at,
      maxWaitMinutes: idleMaxWaitMinutes(maxWaitMinutes),
      now,
    });
    if (resolved.isOpen) {
      await client.query(
        `UPDATE charging_sessions
         SET billing_status = 'WAITING_IDLE', billing_reason = NULL,
             billing_idle_from = $2::timestamptz, billing_next_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [sessionId, resolved.idleInterval.from]
      );
      return { status: 'WAITING_IDLE', reason: 'WAITING_IDLE' };
    }
    idleInterval = resolved.idleInterval;
    if (resolved.isCapped) billingReason = 'IDLE_CAPPED';
  }

  const samples = await listEnergySamples(
    client,
    sessionId,
    session.started_at,
    session.stopped_at,
    session.meter_start
  );
  const priced = priceSession({
    startedAt: session.started_at,
    stoppedAt: session.stopped_at,
    meterStartWh: session.meter_start,
    meterStopWh: session.meter_stop,
    samples,
    timezone: session.timezone,
    tariff: { periods: tariff.periods, idle: tariff.idle },
    idleInterval,
  });
  const periodDate = toLocalParts(session.stopped_at, session.timezone).localDate;
  const tariffSnapshot = {
    version: tariff.version,
    effectiveFrom: tariff.effectiveFrom,
    periods: tariff.periods,
    idle: tariff.idle,
  };
  const invoiceResult = await client.query(
    `INSERT INTO session_invoices (
       session_id, driver_id, station_id, tariff_id, tariff_snapshot,
       timezone, rounding_rule, total_dong, period_date
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::date)
     ON CONFLICT (session_id) DO NOTHING
     RETURNING *`,
    [
      sessionId,
      session.driver_id,
      session.station_id,
      tariff.id,
      JSON.stringify(tariffSnapshot),
      session.timezone,
      priced.roundingRule,
      priced.totalDong,
      periodDate,
    ]
  );

  if (!invoiceResult.rows[0]) {
    const racedInvoice = await findInvoice(client, sessionId);
    return racedInvoice ? { status: 'FINAL', invoice: racedInvoice } : { status: 'IGNORED' };
  }

  const invoiceRow = invoiceResult.rows[0];
  for (const [index, line] of priced.lines.entries()) {
    await client.query(
      `INSERT INTO invoice_lines (
         invoice_id, seq, kind, local_date, from_at, to_at, wh,
         price_per_kwh, minutes, per_min_dong, amount_dong
       ) VALUES ($1, $2, $3, $4::date, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11)`,
      [
        invoiceRow.id,
        index + 1,
        line.kind,
        line.localDate,
        line.from,
        line.to,
        line.wh,
        line.pricePerKwh,
        line.minutes ?? null,
        line.perMinDong ?? null,
        line.amountDong,
      ]
    );
  }

  await client.query(
    `UPDATE charging_sessions
     SET billing_status = 'FINAL', billing_reason = $2,
         billing_idle_from = $3::timestamptz, billing_next_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [sessionId, billingReason, idleInterval?.from || null]
  );

  const invoice = formatInvoice(invoiceRow, priced.lines.map((line, index) => ({
    seq: index + 1,
    kind: line.kind,
    local_date: line.localDate,
    from_at: line.from,
    to_at: line.to,
    wh: line.wh,
    price_per_kwh: line.pricePerKwh,
    minutes: line.minutes ?? null,
    per_min_dong: line.perMinDong ?? null,
    amount_dong: line.amountDong,
  })));

  for (const hook of afterInvoiceHooks.values()) {
    await hook(client, invoice);
  }
  return { status: 'FINAL', invoice };
}

async function finalizeSession(sessionId, {
  pool: poolInstance = null,
  now = Date.now,
  idleMaxWaitMinutes: maxWaitMinutes,
  logError = console.error,
} = {}) {
  try {
    const outcome = await withTransaction(
      (client) => finalizeInTransaction(client, sessionId, now(), maxWaitMinutes),
      poolInstance
    );
    if (outcome.status === 'FINAL' && outcome.invoice?.lines?.some((line) => line.kind === 'IDLE')) {
      await require('../notifications/notify').notifySessionEvent({
        sessionId,
        kind: 'IDLE_FEE_STARTED',
        db: poolInstance || require('../../db/pool').pool,
        logError,
      });
    }
    return outcome;
  } catch (error) {
    await markError(sessionId, poolInstance, error, logError);
    return {
      status: 'ERROR',
      reason: error?.code === '55000' && error?.message?.includes('PERIOD_CLOSED')
        ? 'PERIOD_CLOSED'
        : 'FINALIZATION_FAILED',
    };
  }
}

module.exports = {
  finalizeSession,
  registerAfterInvoice,
};
