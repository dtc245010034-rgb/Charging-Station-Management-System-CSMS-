const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '../..');
const BASE = process.env.TEST_DATABASE_URL || 'postgresql://csms:devpass_local@localhost:5432/csms';

function env(extra = {}) {
  return { PATH: process.env.PATH, DATABASE_URL: BASE, JWT_SECRET: 'z'.repeat(40), APP_ORIGIN: 'http://localhost:3000', ...extra };
}

function run(script, args = [], extra = {}) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, env: env(extra), encoding: 'utf8' });
}

async function query(sql, params) {
  const client = new Client({ connectionString: BASE });
  await client.connect();
  try { return await client.query(sql, params); } finally { await client.end(); }
}

async function resetSchema() {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
}

module.exports = { run, query, resetSchema };
