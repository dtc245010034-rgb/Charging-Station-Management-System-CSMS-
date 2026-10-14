const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { walletDriverIdParam, walletTransactionsQuery } = require('../../lib/schemas');
const walletReadService = require('./wallet-read.service');

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

module.exports = router;
