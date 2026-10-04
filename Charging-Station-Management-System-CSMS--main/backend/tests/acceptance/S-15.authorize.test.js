const { describe, test } = require('node:test');

describe('S-15 Authorize (chưa làm, xem docs/design/S15-S16-ke-hoach.md)', () => {
  test.todo('AC1: thẻ hợp lệ, trạm hoạt động → Accepted');
  test.todo('AC2: thẻ bị khoá → Blocked');
  test.todo('AC3: thẻ quá hạn → Expired');
  test.todo('AC4: thẻ không có trong bảng id_tags → Invalid và ghi nhật ký lần thử');
  test.todo('AC5: trạm tạm ngừng hoặc bị khoá + thẻ hợp lệ → Blocked');
  test.todo('NFR: log chỉ chứa 4 ký tự cuối của thẻ');
  test.todo('idTag dài hơn 20 ký tự bị từ chối (FormationViolation)');
  test.todo('evaluateIdTag là hàm thuần, xuất ra được cho S-17');
});
