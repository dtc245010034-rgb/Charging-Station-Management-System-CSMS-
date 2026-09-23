const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

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
