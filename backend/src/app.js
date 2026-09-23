const path = require('node:path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { pool } = require('./db/pool');
const { AppError } = require('./lib/errors');
const { errorHandler } = require('./middlewares/errorHandler');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const stationsRoutes = require('./modules/stations/stations.routes');
const chargePointsRoutes = require('./modules/charge-points/charge-points.routes');

const app = express();
app.use(cors({ origin: env.APP_ORIGIN.split(','), credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.resolve(__dirname, '../../frontend')));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
  } catch {
    throw new AppError(503, 'DB_UNAVAILABLE', 'Cơ sở dữ liệu không sẵn sàng');
  }
  res.json({ ok: true, service: 'csms-backend', database: 'postgresql', time: new Date().toISOString() });
});

app.use('/api', authRoutes, usersRoutes, stationsRoutes, chargePointsRoutes);
app.use(errorHandler);

module.exports = app;
