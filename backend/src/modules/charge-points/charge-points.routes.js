const express = require('express');
const { authenticate, allow } = require('../../middlewares/authenticate');
const { idParam, stationIdParam } = require('../../lib/schemas');
const service = require('./charge-points.service');
const { createBody, updateBody } = require('./charge-points.schema');

const router = express.Router();

router.get('/charge-points', authenticate, async (req, res) => res.json(await service.list()));
router.get('/charge-points/:id', authenticate, async (req, res) => {
  res.json(await service.get(idParam.parse(req.params).id));
});
router.post('/stations/:stationId/charge-points', authenticate, allow('ADMIN', 'STATION_OWNER'), async (req, res) => {
  const { stationId } = stationIdParam.parse(req.params);
  res.status(201).json(await service.create(req.user, stationId, createBody.parse(req.body ?? {})));
});
router.patch('/charge-points/:id', authenticate, allow('ADMIN', 'STATION_OWNER'), async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await service.update(id, updateBody.parse(req.body ?? {})));
});

module.exports = router;
