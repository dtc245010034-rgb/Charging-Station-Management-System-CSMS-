const repo = require('./stations.repository');
const audit = require('../audit/audit.repository');
const { BadRequestError, NotFoundError } = require('../../lib/errors');

const list = () => repo.list();

async function get(id) {
  const station = await repo.findById(id);
  if (!station) throw new NotFoundError('Không tìm thấy trạm');
  station.charge_points = await repo.chargePointsOf(station.id);
  return station;
}

async function create(actor, data) {
  const result = await repo.insert(data);
  await audit.record(actor.id, 'CREATE', 'station', result.lastInsertRowid, data);
  return repo.findById(result.lastInsertRowid);
}

async function update(actor, id, data) {
  if (!repo.UPDATABLE.some((key) => data[key] !== undefined)) throw new BadRequestError('Không có trường cần cập nhật');
  if (!await repo.findById(id)) throw new NotFoundError('Không tìm thấy trạm');
  await repo.update(id, data);
  await audit.record(actor.id, 'UPDATE', 'station', id, data);
  return repo.findById(id);
}

module.exports = { list, get, create, update };
