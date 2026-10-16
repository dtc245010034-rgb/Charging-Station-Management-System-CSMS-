const audit = require('../audit/audit.repository');
const { ForbiddenError, NotFoundError } = require('../../lib/errors');
const repository = require('./revenue.repository');

async function revenue(actor, period) {
  if (period.stationId !== undefined && actor.roles.includes('STATION_OWNER')) {
    const station = await repository.stationById(period.stationId);
    if (!station) throw new NotFoundError('Không tìm thấy trạm');
    if (String(station.owner_id) !== String(actor.id)) {
      await audit.record(actor.id, 'ACCESS_DENIED', 'station', period.stationId, {}, actor.ip);
      throw new ForbiddenError();
    }
  }

  const rows = await repository.listRevenue(actor, period);
  const total = rows.reduce((sum, row) => ({
    sessions: sum.sessions + row.sessions,
    totalWh: (BigInt(sum.totalWh) + BigInt(row.totalWh)).toString(),
    energyDong: (BigInt(sum.energyDong) + BigInt(row.energyDong)).toString(),
    idleDong: (BigInt(sum.idleDong) + BigInt(row.idleDong)).toString(),
    totalDong: (BigInt(sum.totalDong) + BigInt(row.totalDong)).toString(),
  }), { sessions: 0, totalWh: '0', energyDong: '0', idleDong: '0', totalDong: '0' });

  return { period: { from: period.from, to: period.to }, rows, total };
}

module.exports = { revenue };
