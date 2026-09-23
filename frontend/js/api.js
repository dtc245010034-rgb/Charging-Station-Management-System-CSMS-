export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Mọi request đi qua đây: cùng origin, phiên nằm trong cookie httpOnly (không có token ở client).
export async function api(path, { method = 'GET', body, redirectOn401 = true } = {}) {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);

  if (response.status === 401 && redirectOn401 && location.pathname !== '/index.html') {
    location.replace('/index.html');
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error?.code, data?.error?.message || 'Có lỗi xảy ra, vui lòng thử lại');
  }
  return data;
}
