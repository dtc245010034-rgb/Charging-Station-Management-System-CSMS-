const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../../config/env');
const { authenticate } = require('../../middlewares/authenticate');
const service = require('./auth.service');
const { registerBody, loginBody } = require('./auth.schema');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Quá nhiều yêu cầu đăng nhập từ IP này. Vui lòng thử lại sau 15 phút.' } },
});

const setSessionCookie = (res, token) => res.cookie('token', token, {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 8 * 3600 * 1000,
  secure: env.NODE_ENV === 'production',
});

router.post('/auth/register', async (req, res) => {
  const { user, token } = await service.register(registerBody.parse(req.body ?? {}));
  setSessionCookie(res, token);
  res.status(201).json({ user, token });
});

router.post('/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = loginBody.parse(req.body ?? {});
  const { user, token } = await service.login(email, password);
  setSessionCookie(res, token);
  res.json({ user, token });
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true, message: 'Đăng xuất thành công' });
});

router.get('/auth/me', authenticate, async (req, res) => res.json(await service.me(req.user.id)));

module.exports = router;
