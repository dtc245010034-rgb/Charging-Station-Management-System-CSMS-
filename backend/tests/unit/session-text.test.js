const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (file) => import(pathToFileURL(path.resolve(__dirname, '../../../frontend', file)).href);

describe('frontend/pages/shared/session-text', () => {
  describe('reviewReasonLabel', async () => {
    const { reviewReasonLabel } = await load('pages/shared/session-text.js');

    it('dịch các lý do máy chủ ghi bằng tiếng Anh sang tiếng Việt', () => {
      assert.equal(reviewReasonLabel('Replaced by new transaction'), 'Bị thay bằng phiên mới trên cùng đầu nối');
      assert.equal(reviewReasonLabel('Tag status: Blocked'), 'Thẻ sạc không hợp lệ (trạng thái: Blocked)');
      assert.equal(reviewReasonLabel('Timestamp skewed by more than 24 hours'), 'Đồng hồ trụ lệch quá 24 giờ');
    });

    it('dịch các mã lý do viết hoa của job và bộ lọc số đo', () => {
      assert.equal(reviewReasonLabel('REMOTE_STOP_TIMEOUT'), 'Trụ nhận lệnh dừng nhưng không gửi xác nhận kết thúc');
      assert.equal(reviewReasonLabel('CHARGE_POINT_OFFLINE_TIMEOUT'), 'Trụ mất liên lạc quá lâu');
      assert.equal(reviewReasonLabel('METER_VALUE_DECREASE'), 'Số đo năng lượng giảm');
      assert.equal(reviewReasonLabel('METER_STOP_BELOW_START'), 'Số đo cuối nhỏ hơn số đo đầu');
      assert.equal(reviewReasonLabel('CONNECTOR_AVAILABLE_WITH_OPEN_SESSION'), 'Trụ báo đầu nối rảnh nhưng phiên vẫn đang mở');
    });

    it('ghép nhiều lý do ngăn bằng "; " và giữ nguyên lý do chưa biết', () => {
      assert.equal(
        reviewReasonLabel('REMOTE_STOP_TIMEOUT; Lý do lạ'),
        'Trụ nhận lệnh dừng nhưng không gửi xác nhận kết thúc; Lý do lạ'
      );
    });

    it('lý do rỗng trả về null để giao diện tự dùng câu mặc định', () => {
      assert.equal(reviewReasonLabel(''), null);
      assert.equal(reviewReasonLabel(null), null);
      assert.equal(reviewReasonLabel(undefined), null);
    });
  });

  describe('kwhLabel', async () => {
    const { kwhLabel } = await load('pages/shared/session-text.js');
    const { formatNumber } = await load('app/format.js');

    it('thiếu số liệu hiện "— kWh" (đơn vị đứng sau)', () => {
      assert.equal(kwhLabel(null), '— kWh');
      assert.equal(kwhLabel(undefined), '— kWh');
    });

    it('có số liệu hiện số kèm đơn vị, kể cả 0', () => {
      assert.equal(kwhLabel(1.5), `${formatNumber(1.5)} kWh`);
      assert.equal(kwhLabel(0), `${formatNumber(0)} kWh`);
    });
  });

  describe('lacksEnergyReading', async () => {
    const { lacksEnergyReading } = await load('pages/shared/session-text.js');

    it('true khi phiên chưa có số đo Energy.Active.Import.Register', () => {
      assert.equal(lacksEnergyReading({ current_kwh: null, latest_readings: [] }), true);
      assert.equal(lacksEnergyReading({ current_kwh: null }), true);
      assert.equal(lacksEnergyReading({ current_kwh: null, latest_readings: [{ measurand: 'Power.Active.Import', value: '7200' }] }), true);
    });

    it('false khi đã có số đo năng lượng', () => {
      assert.equal(lacksEnergyReading({ current_kwh: 0, latest_readings: [{ measurand: 'Energy.Active.Import.Register', value: '1500' }] }), false);
    });
  });
});

describe('frontend/pages/driver/start-model', () => {
  describe('startBlockReason', async () => {
    const { startBlockReason } = await load('pages/driver/start-model.js');

    it('đầu nối sẵn sàng thì không bị chặn', () => {
      assert.equal(startBlockReason({ available: true, charge_point_online: true }), null);
    });

    it('trụ ngoại tuyến báo đúng nguyên nhân, không nói "đặt chỗ"', () => {
      const reason = startBlockReason({ available: false, charge_point_online: false });
      assert.match(reason, /ngoại tuyến/);
      assert.doesNotMatch(reason, /đặt chỗ/);
    });

    it('đầu nối đã đặt chỗ, đang sạc, đang có yêu cầu đều được giải thích riêng', () => {
      assert.match(startBlockReason({ available: false, charge_point_online: true, ocpp_status: 'Reserved' }), /đặt chỗ/);
      assert.match(startBlockReason({ available: false, charge_point_online: true, has_active_session: true }), /đang sạc|đang bận/);
      assert.match(startBlockReason({ available: false, charge_point_online: true, has_pending_start: true }), /yêu cầu/);
    });

    it('không có đầu nối nào được chọn thì có lý do chọn đầu nối', () => {
      assert.match(startBlockReason(null), /chọn đầu nối/i);
    });
  });
});
