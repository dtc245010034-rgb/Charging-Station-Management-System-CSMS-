const { BASE, env } = require('./db');

// Phải nạp trước src/app để config/env đọc đúng biến của môi trường test.
Object.assign(process.env, env({ DATABASE_URL: BASE }));

const app = require('../../src/app');
const { pool } = require('../../src/db/pool');

module.exports = { app, closePool: () => pool.end() };
