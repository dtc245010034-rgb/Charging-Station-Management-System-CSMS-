const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const env = require('./config/env');

const poolInstance = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
});

// Proxy object for pool
const pool = {
  async query(text, params) {
    return poolInstance.query(text, params);
  },
  async connect() {
    return poolInstance.connect();
  },
  async end() {
    return poolInstance.end();
  },
};

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

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id BIGSERIAL PRIMARY KEY, version TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const directory = path.resolve(__dirname, '../migrations');
    const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.sql') && !file.endsWith('.down.sql')).sort();
    for (const file of files) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [file]);
      if (applied.rowCount) continue;
      await client.query('BEGIN');
      try {
        await client.query(await fs.readFile(path.join(directory, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied migration ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

async function rollbackLastMigration() {
  const client = await pool.connect();
  try {
    const applied = await client.query('SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1');
    if (!applied.rowCount) return false;
    const version = applied.rows[0].version;
    const downFile = path.resolve(__dirname, '../migrations', version.replace(/\.sql$/, '.down.sql'));
    await client.query('BEGIN');
    try {
      await client.query(await fs.readFile(downFile, 'utf8'));
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
      await client.query('COMMIT');
      console.log(`Rolled back migration ${version}`);
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

module.exports = { pool, prepare, migrate, rollbackLastMigration };
