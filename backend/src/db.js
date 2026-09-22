const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const { newDb } = require('pg-mem');
const argon2 = require('argon2');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

let poolInstance = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://csms:csms_dev_password@localhost:5432/csms',
  connectionTimeoutMillis: 2000,
});

let isMemoryDb = false;

// Proxy object for pool
const pool = {
  async query(text, params) {
    return poolInstance.query(text, params);
  },
  async connect() {
    return poolInstance.connect();
  },
  async end() {
    if (poolInstance?.end) return poolInstance.end();
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

async function initPool() {
  try {
    const client = await poolInstance.connect();
    client.release();
    isMemoryDb = false;
  } catch (err) {
    console.warn('⚠️  PostgreSQL connection failed. Initializing embedded PostgreSQL memory instance...');
    const memDb = newDb();
    // Register custom / default functions
    memDb.public.registerFunction({
      name: 'current_timestamp',
      returns: memDb.public.getType('timestamp with time zone'),
      implementation: () => new Date(),
    });
    const pgMemAdapter = memDb.adapters.createPg();
    poolInstance = new pgMemAdapter.Pool();
    isMemoryDb = true;
  }
}

async function migrate() {
  await initPool();
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
  await initPool();
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

async function seedAdminPassword() {
  const passwordHash = await argon2.hash('admin123', { type: argon2.argon2id });
  const emails = ['admin@.com', 'admin@admin.com', 'admin.com', 'admin@gmail.com', 'admin@csms.vn'];
  const adminRole = (await pool.query("SELECT id FROM roles WHERE code = 'ADMIN'")).rows[0];
  for (const email of emails) {
    const userRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('CSMS Administrator', $1, $2, 'ADMIN')
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'ADMIN', failed_attempts = 0, locked_until = NULL
       RETURNING id`,
      [email, passwordHash]
    );
    const userId = userRes.rows[0]?.id;
    if (userId && adminRole?.id) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING`,
        [userId, adminRole.id]
      );
    }
  }
}

module.exports = { pool, prepare, migrate, rollbackLastMigration, seedAdminPassword, initPool };
