const { z } = require('zod');

const loginBody = z.object({
  email: z.string().catch(''),
  password: z.string().catch(''),
}).catch({ email: '', password: '' });

module.exports = { loginBody };
