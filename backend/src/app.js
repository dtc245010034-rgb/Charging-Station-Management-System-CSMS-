const path = require('node:path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const { errorHandler } = require('./middlewares/errorHandler');
const { requireJson } = require('./middlewares/requireJson');
const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const stationsRoutes = require('./modules/stations/stations.routes');
const chargePointsRoutes = require('./modules/charge-points/charge-points.routes');

const app = express();
if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
app.use(cors({ origin: env.APP_ORIGIN.split(','), credentials: true }));
app.use('/api', requireJson);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.resolve(__dirname, '../../frontend')));

app.use('/api', healthRoutes, authRoutes, usersRoutes, stationsRoutes, chargePointsRoutes);
app.use(errorHandler);

module.exports = app;
