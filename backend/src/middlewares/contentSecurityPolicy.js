// Phòng thủ chiều sâu cho giao diện tĩnh (lớp thứ hai sau việc luôn dùng textContent): dù có lỗi chèn HTML,
// trình duyệt vẫn không chạy script nội tuyến hay tải script từ nguồn khác.
// Thuộc tính style="..." do mã giao diện đặt (h(..., { style })) cần style-src-attr; thẻ <style> nội tuyến vẫn bị chặn.
const DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];
const POLICY = DIRECTIVES.join('; ');

function contentSecurityPolicy(req, res, next) {
  if (!req.path.startsWith('/api/')) res.setHeader('Content-Security-Policy', POLICY);
  next();
}

module.exports = { contentSecurityPolicy, POLICY };
