const { roundHalfUp } = require('../billing/money');
const { AppError } = require('../../lib/errors');

/**
 * Hàm thuần tính phần chia doanh thu theo các đoạn tỉ lệ hợp đồng cho một tháng đã chốt.
 * Tuân thủ K1: Không dùng số thực (floating point), chỉ dùng BigInt và roundHalfUp.
 *
 * @param {Object} params
 * @param {string} params.month - Tháng kế toán định dạng 'YYYY-MM'
 * @param {Array<Object>} params.invoices - Danh sách hóa đơn
 * @param {Array<Object>} params.rates - Danh sách hàng tỉ lệ đối tác
 * @returns {Object} Kết quả gồm summary, lines và byOwner
 */
function computeSettlement({ month, invoices = [], rates = [] }) {
  const monthPrefix = month.slice(0, 7);

  // 1. Lọc hóa đơn có period_date thuộc tháng
  const monthlyInvoices = invoices.filter((inv) => {
    const pDate = String(inv.period_date || '');
    return pDate.startsWith(monthPrefix);
  });

  // 2. Với mỗi hóa đơn, tìm hàng tỉ lệ có hiệu lực tại period_date
  // Tỉ lệ có hiệu lực = hàng có effective_from lớn nhất mà <= period_date
  const missingRates = [];
  const assigned = [];

  for (const inv of monthlyInvoices) {
    const ownerId = Number(inv.owner_id);
    const pDate = String(inv.period_date).slice(0, 10);

    const validRates = rates
      .filter((r) => Number(r.owner_id) === ownerId && String(r.effective_from).slice(0, 10) <= pDate)
      .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)));

    if (validRates.length === 0) {
      missingRates.push({ owner_id: ownerId, period_date: pDate });
    } else {
      assigned.push({
        invoice: inv,
        rate: validRates[0],
      });
    }
  }

  if (missingRates.length > 0) {
    const error = new AppError(409, 'MISSING_RATE', 'Chủ trạm chưa có tỉ lệ chia hiệu lực');
    error.details = { missing: missingRates };
    throw error;
  }

  // 3. Gom theo (owner_id, rate_id) thành các đoạn
  const segments = new Map();

  for (const { invoice, rate } of assigned) {
    const ownerId = Number(rate.owner_id);
    const rateId = Number(rate.id);
    const key = `${ownerId}:${rateId}`;

    if (!segments.has(key)) {
      segments.set(key, {
        owner_id: ownerId,
        rate_id: rateId,
        share_bp: Number(rate.share_bp),
        include_idle: Boolean(rate.include_idle),
        min_date: invoice.period_date,
        max_date: invoice.period_date,
        sessions: 0,
        energy_dong: 0n,
        idle_dong: 0n,
      });
    }

    const seg = segments.get(key);
    seg.sessions += 1;
    seg.energy_dong += BigInt(invoice.energy_dong || 0);
    seg.idle_dong += BigInt(invoice.idle_dong || 0);
    if (invoice.period_date < seg.min_date) seg.min_date = invoice.period_date;
    if (invoice.period_date > seg.max_date) seg.max_date = invoice.period_date;
  }

  // 4. Tính base_dong, share_dong cho từng đoạn
  const lines = [];
  for (const seg of segments.values()) {
    const base_dong = seg.energy_dong + (seg.include_idle ? seg.idle_dong : 0n);
    const share_dong = BigInt(roundHalfUp(base_dong * BigInt(seg.share_bp), 10000n));

    lines.push({
      owner_id: seg.owner_id,
      rate_id: seg.rate_id,
      share_bp: seg.share_bp,
      include_idle: seg.include_idle,
      from_date: seg.min_date,
      to_date: seg.max_date,
      sessions: seg.sessions,
      energy_dong: seg.energy_dong,
      idle_dong: seg.idle_dong,
      base_dong,
      share_dong,
    });
  }

  // Sắp xếp lines theo owner_id, from_date
  lines.sort((a, b) => a.owner_id - b.owner_id || String(a.from_date).localeCompare(String(b.from_date)));

  // 5. Tính tổng theo chủ trạm (byOwner) và toàn bảng kê (summary)
  const byOwner = {};
  let totalRevenue = 0n;
  let totalShare = 0n;

  for (const line of lines) {
    const ownerId = line.owner_id;
    if (!byOwner[ownerId]) {
      byOwner[ownerId] = {
        owner_id: ownerId,
        revenue_dong: 0n,
        share_dong: 0n,
        platform_dong: 0n,
        lines: [],
      };
    }

    const lineRevenue = line.energy_dong + line.idle_dong;
    byOwner[ownerId].revenue_dong += lineRevenue;
    byOwner[ownerId].share_dong += line.share_dong;
    byOwner[ownerId].platform_dong = byOwner[ownerId].revenue_dong - byOwner[ownerId].share_dong;
    byOwner[ownerId].lines.push(line);

    totalRevenue += lineRevenue;
    totalShare += line.share_dong;
  }

  const summary = {
    revenue_dong: totalRevenue,
    share_dong: totalShare,
    platform_dong: totalRevenue - totalShare,
  };

  return {
    month: monthPrefix,
    summary,
    lines,
    byOwner,
  };
}

module.exports = {
  computeSettlement,
};
