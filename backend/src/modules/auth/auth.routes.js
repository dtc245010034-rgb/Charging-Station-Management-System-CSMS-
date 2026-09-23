const express = require('express');
const env = require('../../config/env');
const { authenticate } = require('../../middlewares/authenticate');
const service = require('./auth.service');
const { registerBody, loginBody } = require('./auth.schema');

const router = express.Router();

const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' };
const setSessionCookie = (res, token) => res.cookie('token', token, { ...cookieOptions, maxAge: 8 * 3600 * 1000 });

router.post('/auth/register', async (req, res) => {
  const { user, token } = await service.register(registerBody.parse(req.body ?? {}));
  setSessionCookie(res, token);
  res.status(201).json({ user });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = loginBody.parse(req.body ?? {});
  const { user, token } = await service.login(email, password, req.ip ?? 'unknown');
  setSessionCookie(res, token);
  res.json({ user });
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('token', cookieOptions);
  res.json({ ok: true, message: 'Đăng xuất thành công' });
});

router.get('/auth/me', authenticate, async (req, res) => res.json(await service.me(req.user.id)));

module.exports = router;
