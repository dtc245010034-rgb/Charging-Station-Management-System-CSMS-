const { createHash } = require('node:crypto');
const repo = require('./stations.repository');
const audit = require('../audit/audit.repository');
const { denyOrNotFound } = require('../../lib/ownership');
const { withTransaction } = require('../../db/tx');
const { BadRequestError, ConflictError } = require('../../lib/errors');

const NOT_FOUND = 'Không tìm thấy trạm';

const list = (actor) => repo.list(actor);

async function find(actor, id) {
  const station = await repo.findById(actor, id);
  return station || denyOrNotFound(actor, 'station', id, repo.existsById, NOT_FOUND);
}

async function get(actor, id) {
  const station = await find(actor, id);
  const chargePoints = await repo.chargePointsOf(station.id);
  station.charge_points = await Promise.all(chargePoints.map(async (point) => ({
    ...point,
    connectors: await repo.connectorsOf(point.id),
  })));
  return station;
}

async function create(actor, data, idempotencyKey) {
  if (idempotencyKey) {
    const requestHash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const result = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`station-create:${actor.id}:${idempotencyKey}`]);
      const existing = await client.query(
        'SELECT request_hash, response_body FROM idempotency_keys WHERE user_id = $1 AND key = $2',
        [actor.id, idempotencyKey]
      );
      if (existing.rowCount) {
        if (existing.rows[0].request_hash !== requestHash) throw new ConflictError('Idempotency-Key đã được dùng cho dữ liệu khác');
        return { station: existing.rows[0].response_body, created: false };
      }
      const station = await repo.insertForIdempotency(client, actor, data);
      await client.query(
        'INSERT INTO idempotency_keys (user_id, key, request_hash, response_body) VALUES ($1, $2, $3, $4::jsonb)',
        [actor.id, idempotencyKey, requestHash, JSON.stringify(station)]
      );
      return { station, created: true };
    });
    if (result.created) await audit.record(actor.id, 'CREATE', 'station', result.station.id, { fields: Object.keys(data) });
    return result.station;
  }
  const result = await repo.insert(actor, data);
  await audit.record(actor.id, 'CREATE', 'station', result.lastInsertRowid, { fields: Object.keys(data) });
  return repo.findById(actor, result.lastInsertRowid);
}

async function update(actor, id, data) {
  if (!repo.UPDATABLE.some((key) => data[key] !== undefined)) throw new BadRequestError('Không có trường cần cập nhật');
  const station = await find(actor, id);
  const changingCoordinates = data.latitude !== undefined || data.longitude !== undefined;
  if (station.status === 'ACTIVE' && changingCoordinates) {
    throw new BadRequestError('Hãy chuyển trạm sang INACTIVE trước khi sửa tọa độ');
  }
  await repo.update(id, data);
  await audit.record(actor.id, 'UPDATE', 'station', id, { fields: repo.UPDATABLE.filter((key) => data[key] !== undefined) });
  return repo.findById(actor, id);
}

module.exports = { list, get, create, update };
