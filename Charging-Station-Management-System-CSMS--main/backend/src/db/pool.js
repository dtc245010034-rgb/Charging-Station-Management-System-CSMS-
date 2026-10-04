const { Pool } = require('pg');
const env = require('../config/env');
const { sanitizeErrorMessage } = require('../lib/constants');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
});

// Pool riêng cho handler OCPP: khoá hàng giữ quá lâu thì lỗi sau lock_timeout thay vì treo tới khi trụ tự ngắt (F10).
const ocppPool = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
  options: `-c lock_timeout=${env.OCPP_LOCK_TIMEOUT_SECONDS * 1000}`,
});

// Lỗi trên client rảnh (DB restart, mất mạng) không được làm sập process.
for (const instance of [pool, ocppPool]) {
  instance.on('error', (error) => console.error('Lỗi kết nối PostgreSQL:', sanitizeErrorMessage(error.message)));
}

function convertPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function prepare(sql) {
  const text = convertPlaceholders(sql);
  return {
    async get(...params) {
      const result = await pool.query(text, params);
      return result.rows[0];
    },
    async all(...params) {
      const result = await pool.query(text, params);
      return result.rows;
    },
    async run(...params) {
      const query = /^\s*INSERT\s/i.test(text) && !/\sRETURNING\s/i.test(text) ? `${text} RETURNING id` : text;
      const result = await pool.query(query, params);
      return { lastInsertRowid: result.rows[0]?.id, changes: result.rowCount };
    },
  };
}

module.exports = { pool, ocppPool, prepare };
