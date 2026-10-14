const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const {
  walletDriverIdParam,
  walletTransactionsQuery,
  manualTopupBody,
} = require('../../lib/schemas');
const walletReadService = require('./wallet-read.service');
const walletAdminService = require('./wallet-admin.service');

const router = secureRouter();
const readAccess = [...access('wallets:read-own'), ...access('wallets:read')];

router.get('/drivers/:driverId/wallet', { access: readAccess }, async (req, res) => {
  const { driverId } = walletDriverIdParam.parse(req.params);
  res.json(await walletReadService.getWallet(req.user, Number(driverId)));
});

router.get('/drivers/:driverId/wallet/transactions', { access: readAccess }, async (req, res) => {
  const { driverId } = walletDriverIdParam.parse(req.params);
  const { page } = walletTransactionsQuery.parse(req.query);
  res.json(await walletReadService.listTransactions(req.user, Number(driverId), page));
});

router.post('/admin/wallets/:driverId/manual-topups', { access: access('wallets:manage') }, async (req, res) => {
  const { driverId } = walletDriverIdParam.parse(req.params);
  const data = manualTopupBody.parse(req.body);
  res.status(201).json(await walletAdminService.manualTopup(req.user, Number(driverId), data, req.ip));
});

module.exports = router;
