// IP máy khách theo số proxy tin cậy: phần tử thứ `trustProxy` tính từ cuối X-Forwarded-For.
function clientIpOf(request, trustProxy = 0) {
  const remote = request.socket?.remoteAddress || 'unknown';
  const header = request.headers?.['x-forwarded-for'];
  if (!trustProxy || typeof header !== 'string') return remote;
  const parts = header.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return remote;
  return parts[Math.max(0, parts.length - trustProxy)];
}

module.exports = { clientIpOf };
