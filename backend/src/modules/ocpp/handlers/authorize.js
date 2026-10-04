// Tạm thời chấp nhận mọi idTag không rỗng; S-15 thay bằng tra bảng id_tags (docs/design/S15-S16-ke-hoach.md).
function createAuthorizeHandler() {
  return async function handleAuthorize(payload) {
    return { idTagInfo: { status: payload.idTag ? 'Accepted' : 'Invalid' } };
  };
}

module.exports = { createAuthorizeHandler };
