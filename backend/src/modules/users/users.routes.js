const express = require('express');
const service = require('./users.service');

const router = express.Router();

router.get('/roles', async (req, res) => res.json(await service.listRoles()));

module.exports = router;
