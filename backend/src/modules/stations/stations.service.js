const { createHash } = require('node:crypto');
const { pool } = require('../../db/pool');
const repo = require('./stations.repository');
const audit = require('../audit/audit.repository');
const connectionRegistry = require('../charge-points/connection-registry');
const { findEffectiveTariff } = require('../billing/tariffs.repository');
const { toLocalParts } = require('../billing/tz');
const { denyOrNotFound } = require('../../lib/ownership');
const { withTransaction } = require('../../db/tx');
const { BadRequestError, ConflictError } = require('../../lib/errors');
const { wattsToKilowatts } = require('../power/units');
const { triggerPowerRebalance } = require('../power/rebalance-trigger');

const NOT_FOUND = 'Không tìm thấy trạm';
const EARTH_RADIUS_KM = 6371.0088;

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(lat2 - lat1);
  const longitudeDelta = toRadians(lng2 - lng1);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function stationWithPower(station) {
  const totalW = BigInt(station.rated_total_w || 0);
  const limitW = station.power_limit_w === null ? null : BigInt(station.power_limit_w);
  return {
    ...station,
    power: {
      limitKw: wattsToKilowatts(limitW),
      ratedTotalKw: wattsToKilowatts(totalW),
      oversubscribed: limitW !== null && totalW > limitW,
    },
  };
}

const list = async (actor) => (await repo.list(actor)).map(stationWithPower);

async function searchNearby({ lat, lng, q, connectorType }) {
  const latitude = lat === undefined ? null : Number(lat);
  const longitude = lng === undefined ? null : Number(lng);
  const queryPattern = q === undefined ? null : `%${audit.escapeLike(q)}%`;
  const candidates = await repo.searchCandidates({ queryPattern, connectorType });
  const connectorRows = await repo.searchConnectors(candidates.map((station) => station.id));
  const connectorsByStation = new Map();
  for (const connector of connectorRows) {
    const key = String(connector.station_id);
    if (!connectorsByStation.has(key)) connectorsByStation.set(key, []);
    connectorsByStation.get(key).push(connector);
  }

  const stations = candidates.map((station) => {
    const stationLatitude = station.latitude === null ? NaN : Number(station.latitude);
    const stationLongitude = station.longitude === null ? NaN : Number(station.longitude);
    const rawDistanceKm = latitude === null || !Number.isFinite(stationLatitude) || !Number.isFinite(stationLongitude)
      ? null
      : haversineDistanceKm(latitude, longitude, stationLatitude, stationLongitude);
    const stationConnectors = connectorsByStation.get(String(station.id)) || [];
    const types = [...new Set(stationConnectors.map((connector) => connector.type))].sort();
    const free = stationConnectors.filter((connector) => (
      connector.ocpp_status === 'Available' && connectionRegistry.isConnected(connector.charge_point_code)
    )).length;
    return {
      stationId: Number(station.id),
      name: station.name,
      address: station.address,
      distanceKm: rawDistanceKm === null ? null : Math.round(rawDistanceKm * 10) / 10,
      rawDistanceKm,
      connectors: { free, total: stationConnectors.length, types },
    };
  });
  stations.sort((left, right) => {
    if (left.rawDistanceKm === null) return right.rawDistanceKm === null ? left.stationId - right.stationId : 1;
    if (right.rawDistanceKm === null) return -1;
    return left.rawDistanceKm - right.rawDistanceKm || left.stationId - right.stationId;
  });

  const now = new Date();
  const results = await Promise.all(stations.slice(0, 50).map(async (station) => {
    const tariff = await findEffectiveTariff(pool, station.stationId, now);
    let price = null;
    let idleFee = null;
    if (tariff) {
      const minuteOfDay = toLocalParts(now, tariff.timezone || 'Asia/Ho_Chi_Minh').minuteOfDay;
      const period = tariff.periods.find((candidate) => (
        minuteOfDay >= candidate.startMin && minuteOfDay < candidate.endMin
      ));
      if (period) price = { pricePerKwh: period.pricePerKwh, periodLabel: period.label };
      idleFee = { graceMin: tariff.idle.graceMin, perMinDong: tariff.idle.perMinDong };
    }
    return {
      stationId: station.stationId,
      name: station.name,
      address: station.address,
      distanceKm: station.distanceKm,
      connectors: station.connectors,
      price,
      idleFee,
    };
  }));
  return results;
}

async function find(actor, id) {
  const station = await repo.findById(actor, id);
  return station || denyOrNotFound(actor, 'station', id, repo.existsById, NOT_FOUND);
}

async function get(actor, id) {
  const station = await find(actor, id);
  const chargePoints = await repo.chargePointsOf(station.id);
  station.charge_points = await Promise.all(chargePoints.map(async (point) => {
    const connectors = await repo.connectorsOf(point.id);
    const connectorTotalW = connectors.reduce((total, connector) => total + BigInt(connector.effective_power_w || 0), 0n);
    return {
      ...point,
      power: { ratedTotalKw: wattsToKilowatts(connectorTotalW) },
      connectors: connectors.map((connector) => ({
        ...connector,
        power: { ratedKw: wattsToKilowatts(BigInt(connector.effective_power_w || 0)) },
      })),
    };
  }));
  return stationWithPower(station);
}

async function create(actor, data, idempotencyKey) {
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
  return stationWithPower(await repo.findById(actor, result.station.id));
}

async function update(actor, id, data, { rebalanceStation = null } = {}) {
  if (!repo.UPDATABLE.some((key) => data[key] !== undefined)) throw new BadRequestError('Không có trường cần cập nhật');
  const station = await find(actor, id);
  const changingCoordinates = data.latitude !== undefined || data.longitude !== undefined;
  if (station.status === 'ACTIVE' && changingCoordinates) {
    throw new BadRequestError('Hãy chuyển trạm sang INACTIVE trước khi sửa tọa độ');
  }
  const changedFields = repo.UPDATABLE.filter((key) => data[key] !== undefined);
  const statusChanged = data.status !== undefined && data.status !== station.status;
  await repo.update(id, data);
  if (statusChanged) {
    await audit.record(actor.id, 'STATION_STATUS_CHANGED', 'station', id, {
      from: station.status,
      to: data.status,
    });
    const otherFields = changedFields.filter((key) => key !== 'status');
    if (otherFields.length) await audit.record(actor.id, 'UPDATE', 'station', id, { fields: otherFields });
  } else {
    await audit.record(actor.id, 'UPDATE', 'station', id, { fields: changedFields });
  }
  if (data.power_limit_kw !== undefined || data.power_limit_w !== undefined) {
    triggerPowerRebalance(rebalanceStation, id, 'UPDATE_STATION_LIMIT');
  }
  return stationWithPower(await repo.findById(actor, id));
}

async function setConnectorPower(actor, id, ratedPowerW, { rebalanceStation = null } = {}) {
  const connector = await repo.connectorById(actor, id)
    || await denyOrNotFound(actor, 'connector', id, repo.connectorExistsById, 'Không tìm thấy đầu nối');
  await repo.updateConnectorPower(id, ratedPowerW);
  await audit.record(actor.id, 'UPDATE', 'connector', id, {
    rated_power_w: ratedPowerW,
    charge_point_id: connector.charge_point_id,
    charge_point_code: connector.charge_point_code,
  });
  if (connector.station_id) {
    triggerPowerRebalance(rebalanceStation, connector.station_id, 'UPDATE_CONNECTOR_POWER');
  }
  const updated = await repo.connectorById(actor, id);
  return {
    ...updated,
    power: { ratedKw: wattsToKilowatts(BigInt(updated.effective_power_w || 0)) },
  };
}

async function setLock(actor, id, locked) {
  await find(actor, id);
  await repo.setLock(id, locked, actor.id);
  await audit.record(actor.id, locked ? 'LOCK' : 'UNLOCK', 'station', id, { locked });

  if (locked) {
    const chargePoints = await repo.chargePointsOf(id);
    const codes = chargePoints.map((cp) => cp.code);
    connectionRegistry.closeStationConnection(id, { chargePointCodes: codes });
  }

  return repo.findById(actor, id);
}

module.exports = { list, searchNearby, get, create, update, setLock, setConnectorPower };
