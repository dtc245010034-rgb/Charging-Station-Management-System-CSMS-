const express = require('express');
const { authenticate, allow } = require('../../middlewares/authenticate');
const service = require('./users.service');
const { adminCreateUserBody } = require('./users.schema');

const router = express.Router();

router.get('/roles', async (req, res) => res.json(await service.listRoles()));
router.post('/admin/users', authenticate, allow('ADMIN'), async (req, res) => {
  res.status(201).json({ user: await service.createByAdmin(req.user, adminCreateUserBody.parse(req.body ?? {})) });
});

module.exports = router;
