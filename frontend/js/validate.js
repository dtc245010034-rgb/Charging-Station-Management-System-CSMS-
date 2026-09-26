const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const STATION_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'MAINTENANCE']);

// Trả về { tênTrường: thôngBáo }; rỗng nghĩa là hợp lệ. Backend vẫn kiểm tra lại toàn bộ.
export function validateLogin({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email là bắt buộc';
  else if (!EMAIL.test(email.trim())) errors.email = 'Email không hợp lệ';
  if (!password) errors.password = 'Mật khẩu là bắt buộc';
  return errors;
}

export function validateRegister({ name, email, password }) {
  const errors = {};
  if (!name.trim()) errors.name = 'Họ tên là bắt buộc';
  if (!EMAIL.test(email.trim())) errors.email = 'Email không hợp lệ';
  if (password.length < MIN_PASSWORD) errors.password = `Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự`;
  return errors;
}

export function validateStation({ name, address, latitude, longitude, status, owner_id }, admin = false) {
  const errors = {};
  if (!name.trim()) errors.name = 'Tên trạm là bắt buộc';
  if (!address.trim()) errors.address = 'Địa chỉ là bắt buộc';
  if (latitude !== '') {
    const value = Number(latitude);
    if (!Number.isFinite(value) || value < -90 || value > 90) errors.latitude = 'Vĩ độ phải nằm trong khoảng -90 đến 90';
  }
  if (longitude !== '') {
    const value = Number(longitude);
    if (!Number.isFinite(value) || value < -180 || value > 180) errors.longitude = 'Kinh độ phải nằm trong khoảng -180 đến 180';
  }
  if (!STATION_STATUSES.has(status)) errors.status = 'Trạng thái không hợp lệ';
  if (admin && !String(owner_id || '').trim()) errors.owner_id = 'Chủ trạm là bắt buộc';
  return errors;
}
