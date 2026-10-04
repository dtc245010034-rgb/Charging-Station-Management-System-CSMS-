const argon2 = require('argon2');

const hashPassword = (password) => argon2.hash(password, { type: argon2.argon2id });

async function verifyPassword(user, password) {
  if (!user || !user.password_hash || !password) return false;
  try {
    return user.password_hash.startsWith('$argon2') && await argon2.verify(user.password_hash, password);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
