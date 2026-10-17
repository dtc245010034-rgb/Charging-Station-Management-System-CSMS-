const { AppError, NotFoundError } = require('../../lib/errors');
const { withTransaction } = require('../../db/tx');
const audit = require('../audit/audit.repository');
const { computeSettlement, monthRange } = require('./compute');
const repository = require('./statements.repository');

function totalsFromLines(lines) {
  const totals = lines.reduce((sum, line) => {
    const revenue = BigInt(line.energyDong) + BigInt(line.idleDong);
    const share = BigInt(line.shareDong);
    return {
      revenueDong: sum.revenueDong + revenue,
      shareDong: sum.shareDong + share,
      platformDong: sum.platformDong + revenue - share,
    };
  }, { revenueDong: 0n, shareDong: 0n, platformDong: 0n });
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value.toString()]));
}

function formatLine(line) {
  return {
    ...line,
    platformDong: (
      BigInt(line.energyDong) + BigInt(line.idleDong) - BigInt(line.shareDong)
    ).toString(),
  };
}

function formatStatement(row, lines, totals = null) {
  return {
    id: row.id,
    month: row.month,
    version: row.version,
    supersedesId: row.supersedes_id,
    periodClosedAt: row.period_closed_at,
    reconciliationIssueCount: row.reconciliation_issue_count,
    generatedBy: row.generated_by,
    generatedAt: row.generated_at,
    totals: totals ?? {
      revenueDong: row.revenue_dong,
      shareDong: row.share_dong,
      platformDong: row.platform_dong,
    },
    lines,
  };
}

async function generate(actor, month) {
  return withTransaction(async (client) => {
    const period = await repository.findPeriodForUpdate(client, month);
    if (!period || period.status !== 'CLOSED' || !period.closed_at) {
      throw new AppError(409, 'PERIOD_NOT_CLOSED', 'Kỳ kế toán chưa được chốt');
    }

    const periodClosedAt = period.closed_at;
    const previous = await repository.latestStatement(client, month, periodClosedAt);
    if (previous && !previous.newer_close) {
      throw new AppError(409, 'SETTLEMENT_EXISTS', 'Bảng kê đã được tạo cho lần chốt kỳ này');
    }

    const { toDate } = monthRange(month);
    const invoices = await repository.listInvoices(client, month);
    const rates = await repository.listRates(
      client,
      [...new Set(invoices.map((invoice) => invoice.ownerId))],
      toDate
    );
    const computed = computeSettlement({ month, invoices, rates });
    if (computed.missingRates.length) {
      const error = new AppError(409, 'MISSING_RATE', 'Thiếu tỉ lệ chia cho một số phiên đã lập hóa đơn');
      error.details = computed.missingRates;
      throw error;
    }

    const statement = await repository.insertStatement(client, {
      month,
      version: previous ? previous.version + 1 : 1,
      supersedesId: previous?.id ?? null,
      periodClosedAt,
      generatedBy: actor.id,
      totals: computed.totals,
    });
    await repository.insertLines(client, statement.id, computed.lines);
    await audit.record(actor.id, 'SETTLEMENT_STATEMENT_CREATED', 'settlement_statement', statement.id, {
      month,
      version: statement.version,
      revenue_dong: statement.revenue_dong,
      share_dong: statement.share_dong,
      platform_dong: statement.platform_dong,
    }, actor.ip, client);
    const lines = computed.lines.map(formatLine);
    return formatStatement(statement, lines);
  });
}

async function get(actor, month) {
  const statement = await repository.findLatestForMonth(month);
  if (!statement) throw new NotFoundError('Không tìm thấy bảng kê cho kỳ này');

  const ownerId = actor.roles.includes('STATION_OWNER') ? actor.id : null;
  const lines = (await repository.listLines(statement.id, ownerId)).map(formatLine);
  return formatStatement(statement, lines, ownerId === null ? null : totalsFromLines(lines));
}

module.exports = { generate, get };
