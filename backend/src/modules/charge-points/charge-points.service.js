const repo = require('./charge-points.repository');
const audit = require('../audit/audit.repository');
const { withTransaction } = require('../../db/tx');
const { denyOrNotFound } = require('../../lib/ownership');
const {
  BadRequestError,
  ConflictError,
  GatewayTimeoutError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} = require('../../lib/errors');
const connections = require('./connection-registry');
const { sendRemoteCommand, OcppCommandError } = require('../ocpp/commands');
const { OcppRemoteCallError } = require('../ocpp/message-handler');
const { wattsToKilowatts } = require('../power/units');

const duplicateCode = (error) => (error.code === '23505' ? new ConflictError('Mã trụ đã tồn tại') : error);
const CONFIGURATION_RANGES = {
  HeartbeatInterval: { min: 10, max: 86400 },
  MeterValueSampleInterval: { min: 0, max: 3600 },
};

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
      await audit.ghi_nhat_ky(actor.id, 'RESET', 'charge_point', id, {
        type,
        charge_point_code: point.code,
      }, error.code || 'ERROR', ip);
    } catch (auditError) {
      console.error(`[Reset] Ghi audit thất bại cho trụ ${id}:`, auditError?.message || auditError);
    }
    throw error;
  }
  try {
    await audit.ghi_nhat_ky(actor.id, 'RESET', 'charge_point', id, {
      type,
      charge_point_code: point.code,
    }, response.status, ip);
  } catch (auditError) {
    console.error(`[Reset] Ghi audit thất bại cho trụ ${id}:`, auditError?.message || auditError);
  }
  return response;
}

function mapConfigurationCommandError(error) {
  if (error instanceof OcppCommandError && error.code === 'OFFLINE') {
    return new ConflictError('Trụ sạc không có kết nối OCPP');
  }
  if (error instanceof OcppRemoteCallError) {
    return new UnprocessableEntityError(`Trụ sạc từ chối lệnh cấu hình: ${error.message}`);
  }
  if (/^OCPP call timed out:/.test(error?.message || '')) return new GatewayTimeoutError();
  return error;
}

async function sendConfigurationCommand(point, commandSender, action, payload) {
  if (!connections.isConnected(point.code)) throw new ConflictError('Trụ sạc không có kết nối OCPP');
  if (!commandSender) throw new ServiceUnavailableError('Chức năng điều khiển từ xa chưa được khởi tạo');
  try {
    return await commandSender.send(point.code, action, payload);
  } catch (error) {
    throw mapConfigurationCommandError(error);
  }
}

function valueFromConfiguration(result, key) {
  if (!Array.isArray(result?.configurationKey)) {
    throw new ServiceUnavailableError('Trụ sạc trả cấu hình không hợp lệ');
  }
  return result.configurationKey.find((item) => item.key === key) ?? null;
}

async function getConfigurationValue(point, key, commandSender) {
  const result = await sendConfigurationCommand(point, commandSender, 'GetConfiguration', { key: [key] });
  return valueFromConfiguration(result, key);
}

async function getConfiguration(actor, id, key, commandSender) {
  const point = await repo.findById(actor, id)
    || await denyOrNotFound(actor, 'charge_point', id, repo.existsById, 'Không tìm thấy trụ sạc');
  const entry = await getConfigurationValue(point, key, commandSender);
  if (!entry) throw new ServiceUnavailableError(`Trụ sạc không hỗ trợ khóa cấu hình ${key}`);
  return { key, value: entry.value, readonly: entry.readonly === true };
}

async function changeConfiguration(actor, id, key, value, commandSender, { ip = null } = {}) {
  const point = await repo.findById(actor, id)
    || await denyOrNotFound(actor, 'charge_point', id, repo.existsById, 'Không tìm thấy trụ sạc');
  const range = CONFIGURATION_RANGES[key];
  const valueText = typeof value === 'number' ? String(value) : value;
  const parsedValue = typeof valueText === 'string' && /^\d+$/.test(valueText) ? Number(valueText) : NaN;
  if (!range || !Number.isInteger(parsedValue) || parsedValue < range.min || parsedValue > range.max) {
    throw new BadRequestError(`Giá trị ${key} phải là số nguyên từ ${range?.min ?? 0} đến ${range?.max ?? 0}`);
  }

  let oldValue = null;
  try {
    const current = await getConfigurationValue(point, key, commandSender);
    oldValue = current?.value ?? null;
  } catch (error) {
    console.warn(`[ChangeConfiguration] Không đọc được giá trị cũ cho khóa ${key} trên trụ ${point.code}:`, error?.message || error);
  }

  let status = null;
  try {
    const result = await sendConfigurationCommand(point, commandSender, 'ChangeConfiguration', {
      key,
      value: valueText,
    });
    status = result?.status;
    if (!['Accepted', 'Rejected', 'RebootRequired', 'NotSupported'].includes(status)) {
      status = 'INVALID_RESPONSE';
      throw new ServiceUnavailableError('Trụ sạc trả phản hồi ChangeConfiguration không hợp lệ');
    }
    if (status === 'Accepted' && key === 'HeartbeatInterval') {
      await repo.updateHeartbeatInterval(id, parsedValue);
    }
    return { status };
  } catch (error) {
    if (!status) {
      status = error instanceof ConflictError ? 'OFFLINE' : error instanceof GatewayTimeoutError ? 'TIMEOUT' : 'FAILED';
    }
    throw error;
  } finally {
    try {
      await audit.ghi_nhat_ky(actor.id, 'CHANGE_CONFIGURATION', 'charge_point', id, {
        charge_point_code: point.code,
        key,
        old_value: oldValue,
        new_value: valueText,
      }, status, ip);
    } catch (auditError) {
      console.error(`[ChangeConfiguration] Ghi audit thất bại cho trụ ${id}:`, auditError?.message || auditError);
    }
  }
}

module.exports = {
  list,
  get,
  create,
  update,
  isCodeAvailable,
  reset,
  getConfiguration,
  changeConfiguration,
};
