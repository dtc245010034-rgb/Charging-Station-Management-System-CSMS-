const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
});

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

module.exports = { pool, prepare };
