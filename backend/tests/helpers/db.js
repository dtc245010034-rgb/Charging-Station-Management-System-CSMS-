const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const root = path.resolve(__dirname, '../..');
const BASE = process.env.TEST_DATABASE_URL || 'postgresql://csms:csms_test_only@localhost:5433/csms_test';

if (!new URL(BASE).pathname.slice(1).endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL phải trỏ tới database có tên kết thúc bằng _test');
}

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

async function truncateAll() {
  await query('TRUNCATE audit_logs, login_throttle, connectors, charge_points, stations, user_roles, users RESTART IDENTITY CASCADE');
}

module.exports = { BASE, env, run, query, resetSchema, truncateAll };
