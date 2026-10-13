const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const { idParam } = require('../../lib/schemas');
const invoicesService = require('./invoices.service');

const router = secureRouter();

router.get('/sessions/:id/invoice', {
  access: [...access('invoices:read-own'), ...access('invoices:read')],
}, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await invoicesService.getBySessionId(req.user, Number(id)));
});

module.exports = router;
