const { z } = require('zod');

const createReservationBody = z.object({
  connectorId: z.string()
    .regex(/^[1-9]\d*$/, 'connectorId phải là số nguyên dương')
    .refine((value) => Number.isSafeInteger(Number(value)), 'connectorId vượt giới hạn')
    .transform(Number),
  arriveInMinutes: z.number().int().min(1).max(120),
}).strict();

module.exports = { createReservationBody };