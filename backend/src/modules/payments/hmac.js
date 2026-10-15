const crypto = require('node:crypto');

function computeSignature(secret, rawBody) {
  if (!secret) throw new Error('Secret không được để trống');
  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
  return crypto.createHmac('sha256', secret).update(bodyBuffer).digest('hex');
}

function verifySignature(secret, rawBody, signature) {
  if (!secret || typeof secret !== 'string') return false;
  if (!rawBody) return false;
  if (!signature || typeof signature !== 'string') return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;

  const expectedHex = computeSignature(secret, rawBody);
  const actualBuffer = Buffer.from(signature.toLowerCase(), 'utf8');
  const expectedBuffer = Buffer.from(expectedHex.toLowerCase(), 'utf8');

  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = {
  computeSignature,
  verifySignature,
};
