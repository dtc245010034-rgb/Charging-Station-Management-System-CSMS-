const { z } = require('zod');

const REQUIRED = 'name và address là bắt buộc';
const status = z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'], { message: 'status không hợp lệ' });
const ownerId = z.preprocess(
  (value) => value === null || value === '' || value === undefined ? undefined : Number(value),
  z.number().int().positive('owner_id phải là số nguyên dương').optional()
);
const coordinate = (label, min, max) => z.preprocess(
  (value) => value === null || value === '' || value === undefined ? null : Number(value),
  z.number({ message: `${label} phải là số` }).finite(`${label} phải là số hữu hạn`).min(min, `${label} nằm ngoài phạm vi`).max(max, `${label} nằm ngoài phạm vi`).nullable().optional()
);

const createBody = z.object({
  name: z.string({ message: REQUIRED }).min(1, REQUIRED),
  address: z.string({ message: REQUIRED }).min(1, REQUIRED),
  latitude: coordinate('latitude', -90, 90),
  longitude: coordinate('longitude', -180, 180),
  status: status.default('ACTIVE'),
  owner_id: ownerId,
}, { message: REQUIRED });

const updateBody = z.object({
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  latitude: coordinate('latitude', -90, 90),
  longitude: coordinate('longitude', -180, 180),
  status: status.optional(),
  owner_id: ownerId,
});

module.exports = { createBody, updateBody };
