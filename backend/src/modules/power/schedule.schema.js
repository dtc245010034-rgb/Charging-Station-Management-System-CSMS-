'use strict';

const { z } = require('zod');
const { kilowattsToWatts } = require('./units');

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Giờ phải theo định dạng HH:MM');
const endTimeSchema = z.union([
  timeSchema,
  z.literal('24:00'),
]);

const limitKwSchema = z.union([z.string(), z.number()]).transform((value, context) => {
  const limitW = kilowattsToWatts(value);
  if (limitW === null) {
    context.addIssue({ code: 'custom', message: 'Hạn mức phải lớn hơn 0 kW và tối đa 1 chữ số thập phân' });
    return z.NEVER;
  }
  return limitW;
});

const createPowerWindowBody = z.object({
  startTime: timeSchema,
  endTime: endTimeSchema,
  limitKw: limitKwSchema,
}).strict().superRefine((data, context) => {
  const toMinute = (time) => time === '24:00'
    ? 1440
    : Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  if (toMinute(data.endTime) <= toMinute(data.startTime)) {
    context.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'Giờ kết thúc phải sau giờ bắt đầu; khung qua nửa đêm cần tách thành hai khung',
    });
  }
});

module.exports = { createPowerWindowBody };
