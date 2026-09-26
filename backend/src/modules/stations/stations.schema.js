const { z } = require('zod');

const REQUIRED = 'name và address là bắt buộc';
const status = z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'], { message: 'status không hợp lệ' });

const createBody = z.object({
  name: z.string({ message: REQUIRED }).min(1, REQUIRED),
  address: z.string({ message: REQUIRED }).min(1, REQUIRED),
  latitude: z.unknown().optional(),
  longitude: z.unknown().optional(),
  status: status.default('INACTIVE'),
}, { message: REQUIRED });

const updateBody = z.object({
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  latitude: z.unknown().optional(),
  longitude: z.unknown().optional(),
  status: status.optional(),
});

module.exports = { createBody, updateBody };
