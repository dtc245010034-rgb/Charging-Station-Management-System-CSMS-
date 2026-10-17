const { AppError, NotFoundError, ConflictError } = require('../../lib/errors');
const { denyOrNotFound } = require('../../lib/ownership');
const { withTransaction } = require('../../db/tx');
const audit = require('../audit/audit.repository');
const repository = require('./partners.repository');

async function listPartners(actor) {
  return { partners: await repository.listPartners(actor) };
}

async function listRates(actor, ownerId) {
  if (actor.roles.includes('STATION_OWNER') && String(actor.id) !== String(ownerId)) {
    await denyOrNotFound(actor, 'partner', ownerId, repository.isStationOwner, 'Không tìm thấy chủ trạm');
  }
  if (!await repository.isStationOwner(ownerId)) throw new NotFoundError('Không tìm thấy chủ trạm');
  return { ownerId: String(ownerId), rates: await repository.listRates(ownerId) };
}

async function createRate(actor, ownerId, data) {
  if (!await repository.isStationOwner(ownerId)) throw new NotFoundError('Không tìm thấy chủ trạm');

  try {
    return await withTransaction(async (client) => {
      const periodMonth = `${data.effectiveFrom.slice(0, 7)}-01`;
      const period = await client.query(
        'SELECT status FROM accounting_periods WHERE month = $1::date FOR SHARE',
        [periodMonth]
      );
      if (period.rows[0]?.status === 'CLOSED') {
        throw new AppError(409, 'RATE_IN_CLOSED_PERIOD', 'Ngày hiệu lực thuộc kỳ đã chốt');
      }

      const rate = await repository.insertRate(client, {
        ...data,
        ownerId,
        createdBy: actor.id,
      });
      await audit.record(actor.id, 'PARTNER_RATE_CREATED', 'partner', ownerId, {
        owner_id: String(ownerId),
        share_bp: data.shareBp,
        include_idle: data.includeIdle,
        effective_from: data.effectiveFrom,
      }, actor.ip, client);
      return { rate };
    });
  } catch (error) {
    if (error.code === '23505') throw new ConflictError('Đã có tỉ lệ cho ngày hiệu lực này');
    throw error;
  }
}

module.exports = { listPartners, listRates, createRate };
