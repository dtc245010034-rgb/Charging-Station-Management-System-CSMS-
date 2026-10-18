'use strict';

async function list(db, stationId) {
  const result = await db.query(
    `SELECT id, start_minute, end_minute, limit_w
     FROM station_power_windows
     WHERE station_id = $1 AND deleted_at IS NULL
     ORDER BY start_minute, id`,
    [stationId]
  );
  return result.rows;
}

async function insert(db, { stationId, startMinute, endMinute, limitW, createdBy }) {
  const result = await db.query(
    `INSERT INTO station_power_windows (station_id, start_minute, end_minute, limit_w, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, start_minute, end_minute, limit_w`,
    [stationId, startMinute, endMinute, limitW, createdBy]
  );
  return result.rows[0];
}

async function findActive(db, stationId, windowId) {
  const result = await db.query(
    `SELECT id, start_minute, end_minute, limit_w
     FROM station_power_windows
     WHERE station_id = $1 AND id = $2 AND deleted_at IS NULL`,
    [stationId, windowId]
  );
  return result.rows[0] || null;
}

async function softDelete(db, { stationId, windowId, deletedBy }) {
  const result = await db.query(
    `UPDATE station_power_windows
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $3
     WHERE station_id = $1 AND id = $2 AND deleted_at IS NULL
     RETURNING id, start_minute, end_minute, limit_w`,
    [stationId, windowId, deletedBy]
  );
  return result.rows[0] || null;
}

async function hasActiveWindows(db, stationId) {
  const result = await db.query(
    'SELECT 1 FROM station_power_windows WHERE station_id = $1 AND deleted_at IS NULL LIMIT 1',
    [stationId]
  );
  return result.rowCount > 0;
}

module.exports = { list, insert, findActive, softDelete, hasActiveWindows };
