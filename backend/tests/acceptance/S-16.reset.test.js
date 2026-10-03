const { describe, test } = require('node:test');

describe('S-16 Reset từ xa (chưa làm, xem docs/design/S15-S16-ke-hoach.md)', () => {
  test.todo('AC1: trụ trực tuyến + Reset mềm → Accepted trong 5 giây');
  test.todo('AC2: trụ ngoại tuyến → báo lỗi ngay, không treo');
  test.todo('AC3: trụ không trả lời 30 giây → lỗi hết thời gian và huỷ lời gọi');
  test.todo('chỉ OPERATOR và ADMIN gọi được, các vai trò khác bị 403');
  test.todo('ghi audit_logs: ai bấm, trụ nào, loại Soft/Hard');
  test.todo('lệnh chờ không chặn xử lý tin khác trên cùng kết nối');
});
