const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id BIGSERIAL PRIMARY KEY, version TEXT NOT NULL UNIQUE, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const directory = path.resolve(__dirname, '../../migrations');
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
    const applied = await client.query('SELECT version FROM schema_migrations ORDER BY id DESC LIMIT 1');
    if (!applied.rowCount) return false;
    const version = applied.rows[0].version;
    const downFile = path.resolve(__dirname, '../../migrations', version.replace(/\.sql$/, '.down.sql'));
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

module.exports = { migrate, rollbackLastMigration };

if (require.main === module) {
  (async () => {
    try {
      if (process.argv[2] === 'down') {
        await rollbackLastMigration();
      } else {
        await migrate();
      }
    } finally {
      await pool.end();
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
