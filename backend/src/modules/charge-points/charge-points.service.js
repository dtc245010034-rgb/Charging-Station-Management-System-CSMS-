const repo = require('./charge-points.repository');
const audit = require('../audit/audit.repository');
const { withTransaction } = require('../../db/tx');
const { denyOrNotFound } = require('../../lib/ownership');
const {
  BadRequestError,
  ConflictError,
} = require('../../lib/errors');
const connections = require('./connection-registry');
const { sendRemoteCommand } = require('../ocpp/commands');
const { wattsToKilowatts } = require('../power/units');

const duplicateCode = (error) => (error.code === '23505' ? new ConflictError('Mã trụ đã tồn tại') : error);

const withPower = (point) => ({
  ...point,
  power: { ratedTotalKw: wattsToKilowatts(BigInt(point.rated_total_w || 0)) },
});

const list = async (actor) => (await repo.list(actor)).map(withPower);
const isCodeAvailable = (code) => repo.codeAvailable(code);

async function get(actor, id) {
  const point = await repo.findDetailById(actor, id)
    || await denyOrNotFound(actor, 'charge_point', id, repo.existsById, 'Không tìm thấy trụ sạc');
  point.connectors = (await repo.connectorsOf(point.id)).map((connector) => ({
    ...connector,
    power: { ratedKw: wattsToKilowatts(BigInt(connector.effective_power_w || 0)) },
  }));
  return withPower(point);
}

async function create(actor, stationId, data) {
  if (!await repo.stationInScope(actor, stationId)) await denyOrNotFound(actor, 'station', stationId, repo.stationExists, 'Không tìm thấy trạm');
  let id;
  try {
    id = await withTransaction(async (client) => {
      const cpId = await repo.insert(client, stationId, data);
      for (let connectorNo = 1; connectorNo <= data.connector_count; connectorNo += 1) await repo.insertConnector(client, cpId, connectorNo);
      return cpId;
    });
  } catch (error) {
    throw duplicateCode(error);
  }
  await audit.record(actor.id, 'CREATE', 'charge_point', id, { fields: Object.keys(data) });
  return repo.findById(actor, id);
}

async function update(actor, id, data) {
  const point = await repo.findById(actor, id)
    || await denyOrNotFound(actor, 'charge_point', id, repo.existsById, 'Không tìm thấy trụ sạc');
  if (!repo.UPDATABLE.some((key) => data[key] !== undefined)) throw new BadRequestError('Không có trường cần cập nhật');
  if (data.code !== undefined && data.code !== point.code && connections.isConnected(point.code)) {
    throw new ConflictError('Không thể đổi mã trụ khi trụ đang kết nối');
  }
  try {
    await repo.update(id, data);
  } catch (error) {
    throw duplicateCode(error);
  }
  return repo.findById(actor, id);
}

async function reset(actor, id, type, commandSender, { ip = null } = {}) {
  const point = await repo.findById(actor, id)
    || await denyOrNotFound(actor, 'charge_point', id, repo.existsById, 'Không tìm thấy trụ sạc');
  let response;
  try {
    response = await sendRemoteCommand({
      commandSender,
      chargePointCode: point.code,
      action: 'Reset',
      payload: { type },
      rejectedMessage: 'Trụ sạc từ chối Reset',
    });
  } catch (error) {
    try {
      await audit.ghi_nhat_ky(actor.id, 'RESET', 'charge_point', id, { type }, error.code || 'ERROR', ip);
    } catch (auditError) {
      console.error(`[Reset] Ghi audit thất bại cho trụ ${id}:`, auditError?.message || auditError);
    }
    throw error;
  }
  try {
    await audit.ghi_nhat_ky(actor.id, 'RESET', 'charge_point', id, { type }, response.status, ip);
  } catch (auditError) {
    console.error(`[Reset] Ghi audit thất bại cho trụ ${id}:`, auditError?.message || auditError);
  }
  return response;
}

module.exports = { list, get, create, update, isCodeAvailable, reset };
