const env = require('../../config/env');
const { priceSession } = require('../billing/price-session');
const { meterValueToWh } = require('../sessions/meter-values.repository');
const repository = require('./reconciliation.repository');
const { BadRequestError } = require('../../lib/errors');

function absolute(value) {
  const integer = BigInt(value);
  return integer < 0n ? -integer : integer;
}

function publicIssue(session, type, fields = {}) {
  return {
    sessionId: String(session.id),
    type,
    stationName: session.station_name,
    chargePointCode: session.charge_point_code,
    connectorNo: session.connector_no,
    ...fields,
  };
}

function groupSamples(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.session_id);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function localSamples(rows, meterStart) {
  let previousWh = Number(meterStart);
  const samples = [];
  for (const row of rows) {
    const wh = meterValueToWh(row);
    if (wh <= previousWh) continue;
    samples.push({ at: row.sampled_at, wh });
    previousWh = wh;
  }
  return samples;
}

function priceFromInvoice(session, samples) {
  const tariff = session.tariff_snapshot;
  const idleLine = session.invoice_lines.find((line) => line.kind === 'IDLE');
  const graceMin = Number(tariff.idle?.graceMin || 0);
  const idleInterval = idleLine ? {
    from: new Date(new Date(idleLine.from).getTime() - graceMin * 60_000),
    to: idleLine.to,
  } : undefined;
  return priceSession({
    startedAt: session.started_at,
    stoppedAt: session.stopped_at,
    meterStartWh: session.meter_start,
    meterStopWh: session.meter_stop,
    samples,
    timezone: session.timezone,
    tariff,
    idleInterval,
  });
}

async function build({ from, to }) {
  const sessions = await repository.listCompletedSessions({ from, to });
  if (sessions.length > 5000) {
    throw new BadRequestError('Khoảng đối soát có quá 5.000 phiên; hãy thu hẹp khoảng ngày');
  }
  const sampleRows = await repository.listEnergySamples(sessions.map((session) => session.id));
  const samplesBySession = groupSamples(sampleRows);
  const issues = [];
  let totalDiffDong = 0n;
  let totalAbsDiffDong = 0n;
  let whMeter = 0n;
  let whBilled = 0n;

  for (const session of sessions) {
    const meterWh = BigInt(session.meter_stop ?? 0) - BigInt(session.meter_start ?? 0);
    whMeter += meterWh;
    if (!session.invoice_id) {
      if (meterWh > 0n && session.billing_status !== 'SKIPPED') {
        issues.push(publicIssue(session, 'KWH_NO_INVOICE', {
          diffDong: null,
          diffWh: null,
          billingStatus: session.billing_status,
          billingReason: session.billing_reason,
          meterWh: meterWh.toString(),
        }));
      }
      continue;
    }

    const invoiceTotal = BigInt(session.invoice_total_dong);
    const billedWh = BigInt(session.billed_wh);
    whBilled += billedWh;
    if (session.invoice_driver_id !== null && session.ledger_count === 0) {
      const diff = -invoiceTotal;
      totalDiffDong += diff;
      totalAbsDiffDong += absolute(diff);
      issues.push(publicIssue(session, 'INVOICE_NO_LEDGER', {
        diffDong: diff.toString(),
        diffWh: null,
        invoiceTotalDong: invoiceTotal.toString(),
      }));
    }

    const samples = localSamples(samplesBySession.get(String(session.id)) || [], session.meter_start);
    const calculated = BigInt(priceFromInvoice(session, samples).totalDong);
    const amountDiff = invoiceTotal - calculated;
    if (absolute(amountDiff) > BigInt(env.RECON_TOLERANCE_DONG)) {
      totalDiffDong += amountDiff;
      totalAbsDiffDong += absolute(amountDiff);
      issues.push(publicIssue(session, 'AMOUNT_MISMATCH', {
        diffDong: amountDiff.toString(),
        diffWh: null,
        invoiceTotalDong: invoiceTotal.toString(),
        recalculatedDong: calculated.toString(),
      }));
    }

    if (session.ledger_count > 0) {
      const expectedDebit = -invoiceTotal;
      const ledgerDiff = BigInt(session.ledger_amount_dong) - expectedDebit;
      if (absolute(ledgerDiff) > BigInt(env.RECON_TOLERANCE_DONG)) {
        totalDiffDong += ledgerDiff;
        totalAbsDiffDong += absolute(ledgerDiff);
        issues.push(publicIssue(session, 'LEDGER_AMOUNT_MISMATCH', {
          diffDong: ledgerDiff.toString(),
          diffWh: null,
          invoiceTotalDong: invoiceTotal.toString(),
          ledgerAmountDong: session.ledger_amount_dong,
        }));
      }
    }

    const whDiff = meterWh - billedWh;
    if (whDiff !== 0n) {
      issues.push(publicIssue(session, 'WH_MISMATCH', {
        diffDong: null,
        diffWh: whDiff.toString(),
        meterWh: meterWh.toString(),
        billedWh: billedWh.toString(),
      }));
    }
  }

  issues.sort((left, right) => {
    const leftMagnitude = absolute(left.diffDong ?? left.diffWh ?? 0);
    const rightMagnitude = absolute(right.diffDong ?? right.diffWh ?? 0);
    if (leftMagnitude !== rightMagnitude) return leftMagnitude > rightMagnitude ? -1 : 1;
    if (left.sessionId !== right.sessionId) return BigInt(left.sessionId) < BigInt(right.sessionId) ? -1 : 1;
    return left.type.localeCompare(right.type);
  });

  return {
    period: { from, to },
    summary: {
      sessionsChecked: sessions.length,
      issueCount: issues.length,
      totalDiffDong: totalDiffDong.toString(),
      totalAbsDiffDong: totalAbsDiffDong.toString(),
      whMeter: whMeter.toString(),
      whBilled: whBilled.toString(),
    },
    issues,
  };
}

module.exports = { build };
