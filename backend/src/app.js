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
const createChargePointsRouter = require('./modules/charge-points/charge-points.routes');
const remoteStartRoutes = require('./modules/connectors/remote-start.routes');
const fleetStatusRoutes = require('./modules/fleet-status/fleet-status.routes');
const sessionsRoutes = require('./modules/sessions/sessions.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const tariffsRoutes = require('./modules/billing/tariffs.routes');
const invoicesRoutes = require('./modules/billing/invoices.routes');
const walletRoutes = require('./modules/wallet/wallet.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const periodsRoutes = require('./modules/accounting/periods.routes');
const reconciliationRoutes = require('./modules/reports/reconciliation.routes');
const erasureRoutes = require('./modules/privacy/erasure.routes');
const alertsRoutes = require('./modules/alerts/alerts.routes');
const reservationsRoutes = require('./modules/reservations/reservations.routes');
const partnersRoutes = require('./modules/settlement/partners.routes');
const settlementsRoutes = require('./modules/settlement/settlements.routes');
const sandboxGatewayRoutes = require('./modules/payments/sandbox-gateway.routes');
const webhookRoutes = require('./modules/payments/webhook.routes');
const { registerAfterInvoice } = require('./modules/billing/finalize-session');
const { postEntry } = require('./modules/wallet/ledger.service');

const postSessionInvoiceDebit = async (client, invoice) => {
  if (!invoice.driverId) return;
  return postEntry(client, {
    driverId: invoice.driverId,
    entryType: 'SESSION_DEBIT',
    amountDong: (-BigInt(invoice.totalDong)).toString(),
    sessionId: invoice.sessionId,
    reason: 'SESSION_FINALIZED',
    periodDate: invoice.periodDate,
    allowLocked: true,
  });
};

function createApp({ commandSender, powerRebalancer, rebalanceStation } = {}) {
  registerAfterInvoice('wallet-session-debit', postSessionInvoiceDebit);
  const app = express();
  app.locals.commandSender = commandSender;
  app.locals.rebalanceStation = rebalanceStation || powerRebalancer?.rebalanceStation;
  if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);
  app.use(cors({ origin: env.APP_ORIGIN.split(','), credentials: true }));
  app.use(express.urlencoded({ extended: false }));
  app.use('/sandbox-gateway', sandboxGatewayRoutes);
  // Webhook phải được mount TRƯỚC express.json() để express.raw() trong route đọc được raw body.
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api', requireJson);
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.resolve(__dirname, '../../frontend')));

  app.use('/api', healthRoutes, authRoutes, usersRoutes, stationsRoutes, createChargePointsRouter({ commandSender }), remoteStartRoutes, reservationsRoutes, fleetStatusRoutes, sessionsRoutes, auditRoutes, tariffsRoutes, invoicesRoutes, walletRoutes, notificationsRoutes, reportsRoutes, periodsRoutes, reconciliationRoutes, erasureRoutes, alertsRoutes, partnersRoutes, settlementsRoutes);
  app.use(errorHandler);

  return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
module.exports.postSessionInvoiceDebit = postSessionInvoiceDebit;
