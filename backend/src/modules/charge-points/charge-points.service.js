const repo = require('./charge-points.repository');
const audit = require('../audit/audit.repository');
const { withTransaction } = require('../../db/tx');
const { BadRequestError, ConflictError, NotFoundError } = require('../../lib/errors');

const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const duplicateCode = (error) => (error.code === '23505' ? new ConflictError('Mã trụ đã tồn tại') : error);

const list = () => repo.list();

async function get(id) {
  const point = await repo.findDetailById(id);
  if (!point) throw new NotFoundError('Không tìm thấy trụ sạc');
  point.connectors = await repo.connectorsOf(point.id);
  return point;
}

async function create(actor, stationId, data) {
  if (!await repo.stationExists(stationId)) throw new NotFoundError('Không tìm thấy trạm');
  let id;
  try {
    id = await withTransaction(async (client) => {
      const cpId = await repo.insert(client, stationId, { ...data, power_kw: numeric(data.power_kw) });
      for (let connectorNo = 1; connectorNo <= 4; connectorNo += 1) await repo.insertConnector(client, cpId, connectorNo);
      return cpId;
    });
  } catch (error) {
    throw duplicateCode(error);
  }
  await audit.record(actor.id, 'CREATE', 'charge_point', id, data);
  return repo.findById(id);
}

async function update(id, data) {
  if (!await repo.findById(id)) throw new NotFoundError('Không tìm thấy trụ sạc');
  if (!repo.UPDATABLE.some((key) => data[key] !== undefined)) throw new BadRequestError('Không có trường cần cập nhật');
  try {
    await repo.update(id, data);
  } catch (error) {
    throw duplicateCode(error);
  }
  return repo.findById(id);
}

module.exports = { list, get, create, update };
