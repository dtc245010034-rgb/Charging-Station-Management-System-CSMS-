const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROFILE_RESULTS,
  profileResult,
  resolveSetChargingProfile,
  profileLimitW,
  meterReading,
} = require('../../../tools/lib/charging-profile');

const profile = (limit = 3600) => ({
  connectorId: 1,
  csChargingProfiles: {
    transactionId: 42,
    stackLevel: 1,
    chargingProfilePurpose: 'TxProfile',
    chargingProfileKind: 'Absolute',
    chargingSchedule: {
      chargingRateUnit: 'W',
      chargingSchedulePeriod: [{ startPeriod: 0, limit }],
    },
  },
});

describe('trình giả lập SetChargingProfile', () => {
  it('chỉ chấp nhận các kết quả OCPP được hỗ trợ', () => {
    assert.deepStrictEqual(PROFILE_RESULTS, ['Accepted', 'Rejected', 'NotSupported']);
    assert.strictEqual(profileResult('NotSupported'), 'NotSupported');
    assert.throws(() => profileResult('Error'), /profile result/i);
  });

  it('lưu hồ sơ hợp lệ khi Accepted và không thay hồ sơ hiện tại khi bị từ chối', () => {
    const requested = profile();
    assert.deepStrictEqual(resolveSetChargingProfile(requested, 'Accepted'), {
      status: 'Accepted',
      profile: requested,
    });
    assert.deepStrictEqual(resolveSetChargingProfile(requested, 'Rejected'), {
      status: 'Rejected',
      profile: null,
    });
    assert.deepStrictEqual(resolveSetChargingProfile(requested, 'NotSupported'), {
      status: 'NotSupported',
      profile: null,
    });
    assert.deepStrictEqual(resolveSetChargingProfile({ ...requested, connectorId: 0 }, 'Accepted'), {
      status: 'Rejected',
      profile: null,
    });
  });

  it('chỉ áp dụng giới hạn cho đúng đầu nối và phiên giao dịch', () => {
    const accepted = resolveSetChargingProfile(profile(), 'Accepted').profile;
    assert.strictEqual(profileLimitW(accepted, 1, 42), 3600);
    assert.strictEqual(profileLimitW(accepted, 2, 42), null);
    assert.strictEqual(profileLimitW(accepted, 1, 43), null);
  });

  it('MeterValues không vượt giới hạn và đồng nhất công suất với năng lượng', () => {
    assert.deepStrictEqual(meterReading(1000, null), { meterWh: 1020, powerW: 7200 });
    assert.deepStrictEqual(meterReading(1000, 1800), { meterWh: 1005, powerW: 1800 });
    assert.deepStrictEqual(meterReading(1000, 0), { meterWh: 1000, powerW: 0 });
  });
});
