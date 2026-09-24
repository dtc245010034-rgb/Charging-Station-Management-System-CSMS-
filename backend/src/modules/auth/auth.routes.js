const env = require('../../config/env');
const { authenticate } = require('../../middlewares/authenticate');
const { secureRouter } = require('../../security/routeGuard');
const { access } = require('../../security/permissions');
const service = require('./auth.service');
const { loginBody } = require('./auth.schema');
const { publicRegisterBody } = require('../users/users.schema');

const router = secureRouter();
const PUBLIC = { access: access('auth:public') };

const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production' };
const setSessionCookie = (res, token) => res.cookie('token', token, { ...cookieOptions, maxAge: 8 * 3600 * 1000 });

router.post('/auth/register', PUBLIC, async (req, res) => {
  const { user, token } = await service.register(publicRegisterBody.parse(req.body ?? {}));
  setSessionCookie(res, token);
  res.status(201).json({ user });
});

router.post('/auth/login', PUBLIC, async (req, res) => {
  const { email, password } = loginBody.parse(req.body ?? {});
  const { user, token } = await service.login(email, password, req.ip ?? 'unknown');
  setSessionCookie(res, token);
  res.json({ user });
});

router.post('/auth/logout', PUBLIC, (req, res) => {
  res.clearCookie('token', cookieOptions);
  res.json({ ok: true, message: 'Đăng xuất thành công' });
});

// Bảng quyền xếp auth là public; riêng /me vẫn cần phiên nên giữ authenticate (401 khi chưa đăng nhập).
router.get('/auth/me', PUBLIC, authenticate, async (req, res) => res.json(await service.me(req.user.id)));

module.exports = router;
