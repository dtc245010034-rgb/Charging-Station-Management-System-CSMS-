const { verifySignature } = require('./hmac');

const sandboxGateway = {
  createPayment({ orderRef, amountDong }) {
    if (!orderRef) throw new Error('orderRef là bắt buộc');
    return {
      redirectUrl: `/sandbox-gateway/pay?order=${encodeURIComponent(orderRef)}`,
      orderRef,
      amountDong,
    };
  },

  verifyWebhook({ rawBody, signature, secret }) {
    const isValid = verifySignature(secret, rawBody, signature);
    if (!isValid) {
      return { valid: false, reason: 'BAD_SIGNATURE' };
    }

    try {
      const payloadString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
      const payload = JSON.parse(payloadString);
      return { valid: true, payload };
    } catch {
      return { valid: false, reason: 'INVALID_JSON' };
    }
  },
};

module.exports = {
  sandboxGateway,
};
