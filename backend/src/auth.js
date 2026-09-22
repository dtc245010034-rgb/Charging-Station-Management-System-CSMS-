const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const secret = process.env.JWT_SECRET || 'development-secret';

function issueToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: '8h' });
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Yêu cầu đăng nhập' });
  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

function allow(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Không đủ quyền' });
    next();
  };
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at };
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(password, user.password_hash);
}

module.exports = { authenticate, allow, issueToken, publicUser, verifyPassword, db };
