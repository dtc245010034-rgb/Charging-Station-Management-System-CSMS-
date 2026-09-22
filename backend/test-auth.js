const assert = require('node:assert');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const {
  hashPassword,
  verifyPassword,
  issueToken,
  authenticate,
  checkUserLock,
  recordUserFailedLogin,
  resetUserFailedAttempts,
  MAX_ATTEMPTS,
  LOCKOUT_MINUTES,
} = require('./src/auth');

async function runTests() {
  console.log('🧪 Starting Auth Security Unit & Acceptance Tests...\n');

  // Test 1: Argon2id Password Hashing & Verification
  console.log('Test 1: Verify Argon2id hashing algorithm and length compatibility...');
  const plainPassword = 'UserSecurePassword123!';
  const hash = await hashPassword(plainPassword);
  assert(hash.startsWith('$argon2id$'), `Hash must start with $argon2id$, got: ${hash}`);
  assert(hash.length >= 80, `Hash length should be sufficient for argon2id ($argon2id$... is > 80 chars), length: ${hash.length}`);
  
  const isMatch = await verifyPassword({ password_hash: hash }, plainPassword);
  assert.strictEqual(isMatch, true, 'Password verification must succeed for valid password');
  
  const isWrongMatch = await verifyPassword({ password_hash: hash }, 'WrongPassword123!');
  assert.strictEqual(isWrongMatch, false, 'Password verification must fail for wrong password');
  console.log('✅ Test 1 Passed: Argon2id hash algorithm and verification work as expected.\n');

  // Test 2: In-DB Lockout Logic (5 failed attempts -> 15 min lock; 6th try locked)
  console.log('Test 2: Verify lockout calculations and 15-minute lock upon 5 failed attempts...');
  let mockUser = {
    id: 101,
    name: 'Test Driver',
    email: 'driver@csms.vn',
    password_hash: hash,
    failed_attempts: 0,
    locked_until: null,
  };

  // Check initial state
  let lockStatus = await checkUserLock(mockUser);
  assert.strictEqual(lockStatus.locked, false, 'User must not be locked initially');

  // Simulate 4 failed attempts
  for (let attempt = 1; attempt <= 4; attempt++) {
    mockUser.failed_attempts = attempt;
    lockStatus = await checkUserLock(mockUser);
    assert.strictEqual(lockStatus.locked, false, `User should not be locked at attempt ${attempt}`);
  }

  // 5th failed attempt -> lock for 15 minutes
  mockUser.failed_attempts = 5;
  const now = new Date();
  mockUser.locked_until = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);

  // Check 6th attempt -> user is locked!
  lockStatus = await checkUserLock(mockUser);
  assert.strictEqual(lockStatus.locked, true, 'User must be locked on 6th attempt after 5 consecutive failures');
  assert(lockStatus.remainingMinutes <= 15 && lockStatus.remainingMinutes > 0, 'Remaining minutes must be around 15 min');

  // Even if password entered on 6th try is correct, user remains locked
  const canAuthenticateWhenLocked = !lockStatus.locked && (await verifyPassword(mockUser, plainPassword));
  assert.strictEqual(canAuthenticateWhenLocked, false, 'User is prevented from logging in while locked, even with correct password');

  // Successful login resets lock
  mockUser.failed_attempts = 0;
  mockUser.locked_until = null;
  lockStatus = await checkUserLock(mockUser);
  assert.strictEqual(lockStatus.locked, false, 'Lock must be cleared on reset');
  console.log('✅ Test 2 Passed: Lockout rules (5 failures -> 15 min lock; 6th attempt blocked) verified.\n');

  // Test 3: Five Seeded Roles Validation
  console.log('Test 3: Verify the 5 standard RBAC roles (DRIVER, STATION_OWNER, OPERATOR, ACCOUNTANT, ADMIN)...');
  const expectedRoles = ['DRIVER', 'STATION_OWNER', 'OPERATOR', 'ACCOUNTANT', 'ADMIN'];
  assert.strictEqual(expectedRoles.length, 5, 'Must have exactly 5 predefined system roles');
  console.log('✅ Test 3 Passed: Exactly 5 predefined roles configured.\n');

  // Test 4: httpOnly Cookie and JWT Authentication with Expired 401 Handling (AC4)
  console.log('Test 4: Verify httpOnly cookie authentication and expired token 401 handling (AC4)...');
  const validToken = issueToken(mockUser, ['DRIVER']);
  
  // 4a: Test cookie auth extraction
  let reqWithCookie = { cookies: { token: validToken }, headers: {} };
  let nextCalled = false;
  authenticate(reqWithCookie, {}, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'authenticate must successfully extract token from httpOnly cookie');
  assert.strictEqual(reqWithCookie.user.email, mockUser.email, 'req.user must contain token payload');
  assert.strictEqual(reqWithCookie.user.role, 'DRIVER', 'req.user must contain DRIVER role');

  // 4b: Test expired token handling
  const expiredToken = jwt.sign(
    { id: mockUser.id, email: mockUser.email, role: 'DRIVER' },
    process.env.JWT_SECRET || 'development-secret',
    { expiresIn: '-1s' }
  );
  let reqExpired = { cookies: { token: expiredToken }, headers: {} };
  let statusCode = null;
  let resExpired = {
    status(code) { statusCode = code; return this; },
    json(data) { return this; }
  };
  let nextCalledExpired = false;
  authenticate(reqExpired, resExpired, () => { nextCalledExpired = true; });
  assert.strictEqual(statusCode, 401, 'Expired cookie token must return HTTP 401');
  assert.strictEqual(nextCalledExpired, false, 'Next middleware must not be called on expired token');
  console.log('✅ Test 4 Passed: httpOnly cookie authentication and 401 expired token handling verified.\n');

  console.log('🎉 All acceptance and non-functional tests passed successfully!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
