const { z } = require('zod');

const positiveInt = (label) => z.string()
  .regex(/^[1-9]\d*$/, `${label} phải là số nguyên dương`)
  .refine((value) => Number.isSafeInteger(Number(value)), `${label} phải là số nguyên dương`);

const idParam = z.object({ id: positiveInt('id') });
const stationIdParam = z.object({ stationId: positiveInt('stationId') });

module.exports = { idParam, stationIdParam };
