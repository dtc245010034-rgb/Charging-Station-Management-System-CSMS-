const { describe, it } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  verifyPassword,
  checkUserLock,
  allow,
  authenticate,
  publicUser,
  issueToken,
  recordUserFailedLogin,
  resetUserFailedAttempts,
  MAX_ATTEMPTS,
  LOCKOUT_MINUTES,
} = require('../src/auth');

describe('Unit Tests — Authentication & RBAC Module (auth.js)', () => {
  // --------------------------------------------------------------------------
  // UT-AUTH-01 (P0): verifyPassword with empty/null/undefined inputs
  // --------------------------------------------------------------------------
  describe('UT-AUTH-01 [P0]: verifyPassword with invalid / empty credentials', () => {
    it('should return false when user object is null or undefined', async () => {
      assert.strictEqual(await verifyPassword(null, 'SomePass123!'), false);
      assert.strictEqual(await verifyPassword(undefined, 'SomePass123!'), false);
    });

    it('should return false when user has no password_hash', async () => {
      assert.strictEqual(await verifyPassword({}, 'SomePass123!'), false);
      assert.strictEqual(await verifyPassword({ id: 1 }, 'SomePass123!'), false);
      assert.strictEqual(await verifyPassword({ password_hash: '' }, 'SomePass123!'), false);
    });

    it('should return false when password argument is empty string or not provided', async () => {
      const mockUser = { password_hash: '$argon2id$v=19$m=65536,p=4,t=3$mockhash...' };
      assert.strictEqual(await verifyPassword(mockUser, ''), false);
      assert.strictEqual(await verifyPassword(mockUser, null), false);
      assert.strictEqual(await verifyPassword(mockUser, undefined), false);
    });
  });

  // --------------------------------------------------------------------------
  // UT-AUTH-02 (P1): verifyPassword with legacy bcrypt hash support
  // --------------------------------------------------------------------------
  describe('UT-AUTH-02 [P1]: verifyPassword legacy bcrypt support and auto-upgrade', () => {
    it('should verify password successfully against legacy bcrypt hash ($2a$ / $2b$)', async () => {
      const originalPrepare = require('../src/db').prepare;
      let upgradeRunCalled = false;
      require('../src/db').prepare = () => ({
        run: async () => {
          upgradeRunCalled = true;
          return { changes: 1 };
        },
      });

      try {
        const plainPassword = 'LegacyPassword2026!';
        const salt = bcrypt.genSaltSync(10);
        const bcryptHash = bcrypt.hashSync(plainPassword, salt);

        const mockUser = {
          id: 999,
          email: 'legacy@csms.vn',
          password_hash: bcryptHash,
        };

        const isMatch = await verifyPassword(mockUser, plainPassword);
        assert.strictEqual(isMatch, true, 'Legacy bcrypt password must verify correctly');

        // Wait a tick for the async auto-upgrade background promise in auth.js to settle
        await new Promise((resolve) => setTimeout(resolve, 50));
        assert.strictEqual(upgradeRunCalled, true, 'Auto-upgrade to argon2id should trigger db.prepare.run');

        const isWrong = await verifyPassword(mockUser, 'WrongLegacyPass!');
        assert.strictEqual(isWrong, false, 'Wrong password against bcrypt hash must return false');
      } finally {
        require('../src/db').prepare = originalPrepare;
      }
    });
  });

  // --------------------------------------------------------------------------
  // UT-AUTH-03 (P0): checkUserLock expiry logic
  // --------------------------------------------------------------------------
  describe('UT-AUTH-03 [P0]: checkUserLock automatic unlocking after duration', () => {
    it('should return locked: false when user has no locked_until', async () => {
      const res1 = await checkUserLock(null);
      assert.strictEqual(res1.locked, false);

      const res2 = await checkUserLock({ id: 1, locked_until: null });
      assert.strictEqual(res2.locked, false);
    });

    it('should return locked: false when locked_until is in the past (expired lock)', async () => {
      const pastTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      const expiredLockedUser = {
        id: 102,
        email: 'expired_lock@csms.vn',
        failed_attempts: 5,
        locked_until: pastTime.toISOString(),
      };

      const result = await checkUserLock(expiredLockedUser);
      assert.strictEqual(result.locked, false, 'User must be automatically unlocked once lock time has passed');
    });

    it('should return locked: true with correct remaining minutes when lock is still active', async () => {
      const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
      const lockedUser = {
        id: 103,
        email: 'active_lock@csms.vn',
        failed_attempts: 5,
        locked_until: futureTime.toISOString(),
      };

      const result = await checkUserLock(lockedUser);
      assert.strictEqual(result.locked, true, 'User must be locked when locked_until is in the future');
      assert.strictEqual(typeof result.remainingMinutes, 'number');
      assert(result.remainingMinutes <= 10 && result.remainingMinutes >= 9, 'Remaining minutes should be ~10 minutes');
      assert(result.message.includes('Tài khoản tạm thời bị khóa'), 'Message must explain lock reason');
    });
  });

  // --------------------------------------------------------------------------
  // UT-AUTH-04, UT-AUTH-05, UT-AUTH-06 (P0): allow(...roles) RBAC Middleware
  // --------------------------------------------------------------------------
  describe('UT-AUTH-04, UT-AUTH-05, UT-AUTH-06 [P0]: allow(...roles) RBAC Middleware', () => {
    it('UT-AUTH-06 [P0]: should return 401 when req.user is missing (not authenticated)', () => {
      const middleware = allow('ADMIN', 'OPERATOR');
      const req = {};
      let statusCode = null;
      let errorBody = null;
      let nextCalled = false;

      const res = {
        status(code) { statusCode = code; return this; },
        json(body) { errorBody = body; return this; },
      };

      middleware(req, res, () => { nextCalled = true; });
      assert.strictEqual(statusCode, 401, 'Must return 401 when req.user is undefined');
      assert.strictEqual(errorBody?.error, 'Yêu cầu đăng nhập');
      assert.strictEqual(nextCalled, false, 'next() must not be called');
    });

    it('UT-AUTH-04 [P0]: should allow access (call next) when user has authorized primary role', () => {
      const middleware = allow('ADMIN', 'MANAGER');
      const req = { user: { id: 1, email: 'admin@csms.vn', role: 'ADMIN' } };
      let nextCalled = false;

      middleware(req, {}, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true, 'User with ADMIN role must be allowed');
    });

    it('UT-AUTH-04 [P0]: should allow access when user has matching role inside roles array', () => {
      const middleware = allow('ACCOUNTANT');
      const req = { user: { id: 2, email: 'finance@csms.vn', role: 'OPERATOR', roles: ['OPERATOR', 'ACCOUNTANT'] } };
      let nextCalled = false;

      middleware(req, {}, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true, 'User with matching role in roles array must be allowed');
    });

    it('UT-AUTH-05 [P0]: should return 403 Forbidden when user role is not in allowed list', () => {
      const middleware = allow('ADMIN', 'MANAGER');
      const req = { user: { id: 3, email: 'driver@csms.vn', role: 'DRIVER', roles: ['DRIVER'] } };
      let statusCode = null;
      let errorBody = null;
      let nextCalled = false;

      const res = {
        status(code) { statusCode = code; return this; },
        json(body) { errorBody = body; return this; },
      };

      middleware(req, res, () => { nextCalled = true; });
      assert.strictEqual(statusCode, 403, 'Must return 403 Forbidden for unauthorized role');
      assert.strictEqual(errorBody?.error, 'Không đủ quyền truy cập');
      assert.strictEqual(nextCalled, false, 'next() must not be called on 403');
    });
  });

  // --------------------------------------------------------------------------
  // UT-AUTH-07, UT-AUTH-08 (P0, P1): authenticate Middleware
  // --------------------------------------------------------------------------
  describe('UT-AUTH-07 [P0], UT-AUTH-08 [P1]: authenticate Middleware via Bearer Header & Cookie', () => {
    it('UT-AUTH-07 [P0]: should authenticate successfully via Authorization Bearer header', () => {
      const mockUser = { id: 77, email: 'bearer_user@csms.vn', role: 'OPERATOR' };
      const token = issueToken(mockUser, ['OPERATOR']);

      const req = {
        cookies: {},
        headers: { authorization: `Bearer ${token}` },
      };
      let nextCalled = false;

      authenticate(req, {}, () => { nextCalled = true; });
      assert.strictEqual(nextCalled, true, 'authenticate must proceed when valid Bearer token provided');
      assert.strictEqual(req.user?.email, mockUser.email);
      assert.strictEqual(req.user?.role, 'OPERATOR');
    });

    it('UT-AUTH-08 [P1]: should return 401 when Authorization header does not use Bearer scheme', () => {
      const req = {
        cookies: {},
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      };
      let statusCode = null;
      let errorBody = null;
      let nextCalled = false;

      const res = {
        status(code) { statusCode = code; return this; },
        json(body) { errorBody = body; return this; },
      };

      authenticate(req, res, () => { nextCalled = true; });
      assert.strictEqual(statusCode, 401, 'Must reject non-Bearer authorization');
      assert.strictEqual(errorBody?.error, 'Yêu cầu đăng nhập');
      assert.strictEqual(nextCalled, false);
    });

    it('should return 401 when token is malformed / signature invalid', () => {
      const req = {
        cookies: {},
        headers: { authorization: 'Bearer invalid.token.payload' },
      };
      let statusCode = null;
      let errorBody = null;
      let nextCalled = false;

      const res = {
        status(code) { statusCode = code; return this; },
        json(body) { errorBody = body; return this; },
      };

      authenticate(req, res, () => { nextCalled = true; });
      assert.strictEqual(statusCode, 401, 'Must reject malformed token with 401');
      assert.strictEqual(errorBody?.error, 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ');
      assert.strictEqual(nextCalled, false);
    });
  });

  // --------------------------------------------------------------------------
  // UT-AUTH-09 (P0): publicUser serialization security
  // --------------------------------------------------------------------------
  describe('UT-AUTH-09 [P0]: publicUser data sanitization', () => {
    it('should strip password_hash from the returned user object', () => {
      const rawUser = {
        id: 501,
        name: 'Nguyen Ha Nam',
        email: 'nam@codegym.vn',
        password_hash: '$argon2id$v=19$m=65536,p=4,t=3$secretHash1234567890',
        role: 'ADMIN',
        failed_attempts: 2,
        locked_until: null,
        created_at: '2026-09-22T00:00:00Z',
      };

      const sanitized = publicUser(rawUser, ['ADMIN']);

      assert.strictEqual(sanitized.id, 501);
      assert.strictEqual(sanitized.name, 'Nguyen Ha Nam');
      assert.strictEqual(sanitized.email, 'nam@codegym.vn');
      assert.strictEqual(sanitized.role, 'ADMIN');
      assert.deepStrictEqual(sanitized.roles, ['ADMIN']);
      assert.strictEqual(sanitized.password_hash, undefined, 'password_hash must NEVER be exposed in publicUser');
      assert.strictEqual('password_hash' in sanitized, false, 'password_hash key must not exist in sanitized object');
    });

    it('should default role to OPERATOR if user.role is missing', () => {
      const rawUser = { id: 502, name: 'No Role User', email: 'norole@csms.vn' };
      const sanitized = publicUser(rawUser);

      assert.strictEqual(sanitized.role, 'OPERATOR', 'Default role must be OPERATOR');
      assert.deepStrictEqual(sanitized.roles, ['OPERATOR']);
    });
  });

  // --------------------------------------------------------------------------
  // UT-LOCK-01 [P0]: recordUserFailedLogin and resetUserFailedAttempts logic
  // --------------------------------------------------------------------------
  describe('UT-LOCK-01 [P0]: Account lockout persistence logic (db mocks)', () => {
    it('should update failed_attempts count and not lock if attempts < 5', async () => {
      let executedSql = null;
      let executedParams = null;

      // Temporary mock db prepare for isolation
      const originalPrepare = require('../src/db').prepare;
      require('../src/db').prepare = (sql) => ({
        run: async (...params) => {
          executedSql = sql;
          executedParams = params;
          return { changes: 1 };
        },
      });

      try {
        const user = { id: 10, failed_attempts: 2, locked_until: null };
        await recordUserFailedLogin(user);

        assert(executedSql.includes('UPDATE users SET failed_attempts = ?'), 'SQL must update users table');
        assert.strictEqual(executedParams[0], 3, 'failed_attempts must increment to 3');
        assert.strictEqual(executedParams[1], null, 'locked_until must remain null when attempts < 5');
        assert.strictEqual(executedParams[2], 10, 'Target user ID must match');
      } finally {
        require('../src/db').prepare = originalPrepare;
      }
    });

    it('should lock account for 15 minutes when 5th consecutive failure is recorded', async () => {
      let executedParams = null;

      const originalPrepare = require('../src/db').prepare;
      require('../src/db').prepare = () => ({
        run: async (...params) => {
          executedParams = params;
          return { changes: 1 };
        },
      });

      try {
        const user = { id: 10, failed_attempts: 4, locked_until: null };
        const before = Date.now();
        await recordUserFailedLogin(user);
        const after = Date.now();

        assert.strictEqual(executedParams[0], 5, 'failed_attempts must become 5');
        assert(executedParams[1] instanceof Date, 'locked_until must be a Date object');

        const lockedUntilMs = executedParams[1].getTime();
        const expectedMinMs = before + LOCKOUT_MINUTES * 60 * 1000;
        const expectedMaxMs = after + LOCKOUT_MINUTES * 60 * 1000;

        assert(lockedUntilMs >= expectedMinMs && lockedUntilMs <= expectedMaxMs, 'Lockout must be set to exactly 15 minutes from now');
      } finally {
        require('../src/db').prepare = originalPrepare;
      }
    });

    it('should reset failed_attempts to 0 and locked_until to NULL on successful reset', async () => {
      let executedSql = null;
      let executedParams = null;

      const originalPrepare = require('../src/db').prepare;
      require('../src/db').prepare = (sql) => ({
        run: async (...params) => {
          executedSql = sql;
          executedParams = params;
          return { changes: 1 };
        },
      });

      try {
        await resetUserFailedAttempts(10);
        assert(executedSql.includes('failed_attempts = 0, locked_until = NULL'), 'SQL must reset lock fields');
        assert.strictEqual(executedParams[0], 10, 'User ID must be passed');
      } finally {
        require('../src/db').prepare = originalPrepare;
      }
    });
  });
});
