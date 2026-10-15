// Lý do một đầu nối chưa bắt đầu sạc được; null nghĩa là bắt đầu được.
export function startBlockReason(connector) {
  if (!connector) return 'Hãy chọn đầu nối để bắt đầu sạc.';
  if (connector.available) return null;
  if (!connector.charge_point_online) return 'Trụ sạc đang ngoại tuyến. Hãy chọn trụ khác hoặc thử lại sau.';
  if (connector.ocpp_status === 'Reserved') return 'Đầu nối đã được đặt chỗ. Hãy chọn đầu nối khác.';
  if (connector.has_active_session || connector.ocpp_status === 'Charging') return 'Đầu nối đang bận sạc. Hãy chọn đầu nối khác.';
  if (connector.has_pending_start) return 'Đầu nối đang có một yêu cầu bắt đầu sạc. Vui lòng chờ.';
  return 'Đầu nối chưa sẵn sàng. Hãy cắm súng sạc rồi làm mới trạng thái.';
}

export function startErrorMessage(error) {
  if (error?.code === 'WALLET_BELOW_MIN') {
    return 'Số dư ví chưa đủ để bắt đầu sạc. Vui lòng nạp thêm tiền.';
  }
  if (error?.code === 'WALLET_LOCKED') {
    return 'Ví đang bị khóa để kiểm tra. Vui lòng liên hệ hỗ trợ.';
  }
  return error?.message || 'Không thể bắt đầu sạc. Vui lòng thử lại.';
}

export function startErrorAction(error) {
  if (error?.code === 'WALLET_BELOW_MIN') {
    return { label: 'Nạp tiền', href: '#/driver/wallet' };
  }
  return null;
}
