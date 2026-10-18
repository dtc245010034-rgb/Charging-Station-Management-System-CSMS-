const { z } = require('zod');
const { kilowattsToWatts } = require('../power/units');

const REQUIRED = 'name và address là bắt buộc';
const NO_STATUS = 'Trạm mới luôn ở trạng thái chưa hoạt động, không được chỉ định status';
const POWER_KW_ERROR = 'Công suất phải từ 0,1 đến 100.000 kW và tối đa 1 chữ số thập phân';
const status = z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'], { message: 'status không hợp lệ' });
const text = (message) => z.string({ message }).trim().min(1, message);
const powerKilowatts = z.union([z.string(), z.number()]).transform((value, context) => {
  const watts = kilowattsToWatts(value);
  if (watts === null) {
    context.addIssue({ code: 'custom', message: POWER_KW_ERROR });
    return z.NEVER;
  }
  return watts;
});

const coordinate = (label, min, max) => z.union([
  z.number().finite(),
  z.string().trim().regex(/^-?\d+(?:\.\d{1,8})?$/, `${label} phải có tối đa 8 chữ số thập phân`),
]).refine((value) => Number(value) >= min && Number(value) <= max, `${label} phải từ ${min} đến ${max}`);

const timezoneSchema = z.string().trim().refine((val) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: val });
    return true;
  } catch {
    return false;
  }
}, 'Múi giờ không hợp lệ');

const powerProfileSlot = z.object({
  start: z.string().regex(/^([0-1]?\d|2[0-3]):[0-5]\d$/).optional(),
  end: z.string().regex(/^([0-1]?\d|2[0-3]):[0-5]\d$/).optional(),
  maxKw: z.coerce.number().min(0).optional(),
});

const normalizeStationPowerLimit = (data) => {
  const limitKw = data.power_limit_kw ?? data.power_limit_w;
  if (limitKw === undefined) return data;

  const watts = typeof limitKw === 'number' && Number.isFinite(limitKw)
    ? limitKw
    : kilowattsToWatts(limitKw);

  if (watts === null) return data;
  data.power_limit_w = watts;
  delete data.power_limit_kw;
  return data;
};

const createBody = z.object({
  name: text(REQUIRED),
  address: text(REQUIRED),
  latitude: coordinate('Vĩ độ', -90, 90),
  longitude: coordinate('Kinh độ', -180, 180),
  timezone: timezoneSchema.optional(),
  power_limit_kw: powerKilowatts.nullable().optional(),
  power_limit_w: z.coerce.number().int().nonnegative().nullable().optional(),
  power_profile: z.array(powerProfileSlot).optional(),
  status: z.undefined({ message: NO_STATUS }).optional(),
}, { message: REQUIRED }).transform((data) => normalizeStationPowerLimit(data));

const updateBody = z.object({
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  latitude: coordinate('Vĩ độ', -90, 90).optional(),
  longitude: coordinate('Kinh độ', -180, 180).optional(),
  timezone: timezoneSchema.optional(),
  power_limit_kw: powerKilowatts.nullable().optional(),
  power_limit_w: z.coerce.number().int().nonnegative().nullable().optional(),
  power_profile: z.array(powerProfileSlot).optional(),
  status: status.optional(),
}).superRefine((data, context) => {
  if ((data.latitude !== undefined) !== (data.longitude !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Vĩ độ và kinh độ phải được cập nhật cùng nhau', path: ['latitude'] });
  }
}).transform((data) => normalizeStationPowerLimit(data));

const lockBody = z.object({
  locked: z.boolean({ message: 'locked phải là boolean' }),
}, { message: 'Dữ liệu không hợp lệ' });

const connectorPowerBody = z.object({
  rated_power_kw: powerKilowatts.nullable(),
}).transform(({ rated_power_kw }) => ({ rated_power_w: rated_power_kw }));

const stationSearchBody = z.object({
  lat: coordinate('Vĩ độ', -90, 90).optional(),
  lng: coordinate('Kinh độ', -180, 180).optional(),
  q: z.string().trim().min(2, 'q phải có từ 2 đến 100 ký tự').max(100, 'q phải có từ 2 đến 100 ký tự').optional(),
  connectorType: z.string().trim().min(1).max(40).optional(),
}).superRefine((data, context) => {
  if ((data.lat === undefined) !== (data.lng === undefined)) {
    context.addIssue({ code: 'custom', message: 'lat và lng phải được gửi cùng nhau', path: ['lat'] });
  }
  if (data.lat === undefined && data.q === undefined) {
    context.addIssue({ code: 'custom', message: 'Cần tọa độ hoặc q để tìm trạm', path: ['q'] });
  }
});

module.exports = { createBody, updateBody, lockBody, connectorPowerBody, stationSearchBody };
