const stationsRepo = require('../stations/stations.repository');
const tariffsRepo = require('./tariffs.repository');
const audit = require('../audit/audit.repository');
const { denyOrNotFound } = require('../../lib/ownership');
const { withTransaction } = require('../../db/tx');
const { BadRequestError, ConflictError } = require('../../lib/errors');
const { toLocalParts } = require('./tz');
const { normalizePeriods } = require('./tariff-periods');

const NOT_FOUND = 'Không tìm thấy trạm';

async function list(actor, stationId) {
  const station = await stationsRepo.findById(actor, stationId);
  if (!station) {
    await denyOrNotFound(actor, 'station', stationId, stationsRepo.existsById, NOT_FOUND);
  }

  const tz = station.timezone || 'Asia/Ho_Chi_Minh';
  const todayStr = toLocalParts(new Date(), tz).localDate;

  const rawTariffs = await tariffsRepo.listByStation(stationId);

  // Tìm tariff đang ACTIVE (effective_from <= todayStr gần nhất)
  const activeTariff = rawTariffs.find((t) => t.effective_from <= todayStr);
  const activeId = activeTariff ? activeTariff.id : null;

  const tariffs = await Promise.all(
    rawTariffs.map(async (t) => {
      let state = 'SCHEDULED';
      if (t.effective_from > todayStr) {
        state = 'SCHEDULED';
      } else if (t.id === activeId) {
        state = 'ACTIVE';
      } else {
        state = 'EXPIRED';
      }

      const periods = await tariffsRepo.periodsOfTariff(t.id);
      return {
        ...t,
        state,
        periods,
      };
    })
  );

  return tariffs;
}

async function create(actor, stationId, data) {
  const station = await stationsRepo.findById(actor, stationId);
  if (!station) {
    await denyOrNotFound(actor, 'station', stationId, stationsRepo.existsById, NOT_FOUND);
  }

  const norm = normalizePeriods(data.periods);
  if (!norm.ok) {
    throw new BadRequestError('Khung giờ không hợp lệ', norm.errors);
  }

  const tz = station.timezone || 'Asia/Ho_Chi_Minh';
  const todayStr = toLocalParts(new Date(), tz).localDate;

  if (data.effectiveFrom < todayStr) {
    throw new BadRequestError('Ngày hiệu lực không được ở quá khứ');
  }

  const count = await tariffsRepo.countTariffs(stationId);
  if (count > 0 && data.effectiveFrom <= todayStr) {
    throw new BadRequestError('Biểu giá mới chỉ được áp dụng từ ngày mai trở đi');
  }

  const exists = await tariffsRepo.existsForDate(stationId, data.effectiveFrom);
  if (exists) {
    throw new ConflictError('Đã có biểu giá cho ngày này');
  }

  const maxVer = await tariffsRepo.maxVersion(stationId);
  const version = maxVer + 1;

  const created = await withTransaction(async (client) => {
    return tariffsRepo.insertTariffWithPeriods(
      client,
      {
        stationId,
        version,
        effectiveFrom: data.effectiveFrom,
        idleGraceMin: data.idle?.graceMin ?? 0,
        idlePerMinDong: data.idle?.perMinDong ?? 0,
        createdBy: actor.id,
      },
      norm.periods
    );
  });

  await audit.record(actor.id, 'TARIFF_CREATED', 'station', stationId, {
    station_id: stationId,
    tariff_id: created.id,
    version: created.version,
    effective_from: created.effective_from,
  });

  return created;
}

module.exports = {
  list,
  create,
};
