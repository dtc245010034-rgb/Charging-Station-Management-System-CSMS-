const repo = require('./stations.repository');
const users = require('../users/users.repository');
const audit = require('../audit/audit.repository');
const { denyOrNotFound } = require('../../lib/ownership');
const { BadRequestError, ForbiddenError, NotFoundError } = require('../../lib/errors');

const NOT_FOUND = 'Không tìm thấy trạm';

const list = (actor) => repo.list(actor);

const rolesOf = (actor) => actor.roles || (actor.role ? [actor.role] : []);
const isAdmin = (actor) => rolesOf(actor).includes('ADMIN');

async function validateOwner(ownerId) {
  const owner = await users.findById(ownerId);
  if (!owner) throw new NotFoundError('Không tìm thấy chủ trạm');
  const roles = await users.roleCodesOf(ownerId);
  if (!roles.includes('STATION_OWNER')) throw new BadRequestError('owner_id phải thuộc tài khoản STATION_OWNER');
  return ownerId;
}

async function resolveOwner(actor, requestedOwnerId) {
  if (isAdmin(actor)) {
    if (requestedOwnerId === undefined) throw new BadRequestError('owner_id là bắt buộc khi Admin tạo trạm');
    return validateOwner(requestedOwnerId);
  }
  if (requestedOwnerId !== undefined && Number(requestedOwnerId) !== Number(actor.id)) {
    throw new ForbiddenError('Bạn chỉ có thể tạo trạm thuộc sở hữu của mình');
  }
  return actor.id;
}

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
  const ownerId = await resolveOwner(actor, data.owner_id);
  const result = await repo.insert(data, ownerId);
  await audit.record(actor.id, 'CREATE', 'station', result.lastInsertRowid, { fields: Object.keys(data) });
  return repo.findById(actor, result.lastInsertRowid);
}

async function update(actor, id, data) {
  if (!repo.UPDATABLE.some((key) => data[key] !== undefined)) throw new BadRequestError('Không có trường cần cập nhật');
  const current = await find(actor, id);
  const fields = { ...data };
  if (fields.owner_id !== undefined) {
    if (!isAdmin(actor)) throw new ForbiddenError('Chỉ Admin được phân lại chủ trạm');
    await validateOwner(fields.owner_id);
  }
  await repo.update(id, fields);
  const metadata = { fields: repo.UPDATABLE.filter((key) => data[key] !== undefined) };
  if (fields.owner_id !== undefined && Number(fields.owner_id) !== Number(current.owner_id)) {
    metadata.previous_owner_id = current.owner_id;
    metadata.owner_id = fields.owner_id;
  }
  await audit.record(actor.id, 'UPDATE', 'station', id, metadata);
  return repo.findById(actor, id);
}

module.exports = { list, get, create, update };
