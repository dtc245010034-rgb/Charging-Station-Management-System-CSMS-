const repo = require('./stations.repository');
const audit = require('../audit/audit.repository');
const { denyOrNotFound } = require('../../lib/ownership');
const { BadRequestError } = require('../../lib/errors');

const NOT_FOUND = 'Không tìm thấy trạm';

const list = (actor) => repo.list(actor);

async function find(actor, id) {
  const station = await repo.findById(actor, id);
  return station || denyOrNotFound(actor, 'station', id, repo.existsById, NOT_FOUND);
}

async function get(actor, id) {
  const station = await find(actor, id);
  station.charge_points = await repo.chargePointsOf(station.id);
  return station;
}

async function create(actor, data) {
  const result = await repo.insert(actor, data);
  await audit.record(actor.id, 'CREATE', 'station', result.lastInsertRowid, { fields: Object.keys(data) });
  return repo.findById(actor, result.lastInsertRowid);
}

async function update(actor, id, data) {
  if (!repo.UPDATABLE.some((key) => data[key] !== undefined)) throw new BadRequestError('Không có trường cần cập nhật');
  await find(actor, id);
  await repo.update(id, data);
  await audit.record(actor.id, 'UPDATE', 'station', id, { fields: repo.UPDATABLE.filter((key) => data[key] !== undefined) });
  return repo.findById(actor, id);
}

module.exports = { list, get, create, update };
