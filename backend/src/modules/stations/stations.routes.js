const express = require('express');
const { authenticate, allow } = require('../../middlewares/authenticate');
const { idParam } = require('../../lib/schemas');
const service = require('./stations.service');
const { createBody, updateBody } = require('./stations.schema');

const router = express.Router();

router.get('/stations', authenticate, async (req, res) => res.json(await service.list()));
router.post('/stations', authenticate, allow('ADMIN', 'STATION_OWNER'), async (req, res) => {
  res.status(201).json(await service.create(req.user, createBody.parse(req.body ?? {})));
});
router.get('/stations/:id', authenticate, async (req, res) => {
  res.json(await service.get(idParam.parse(req.params).id));
});
router.patch('/stations/:id', authenticate, allow('ADMIN', 'STATION_OWNER'), async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json(await service.update(req.user, id, updateBody.parse(req.body ?? {})));
});

module.exports = router;
