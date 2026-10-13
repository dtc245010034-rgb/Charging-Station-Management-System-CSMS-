const IDLE_SET = new Set(['SuspendedEV', 'Finishing']);

/**
 * Xác định khoảng chiếm trụ từ danh sách sự kiện trạng thái đầu nối.
 *
 * @param {Array<{ occurred_at?: string, occurredAt?: string, ocpp_status?: string, ocppStatus?: string }>} events
 * @param {object} options
 * @param {string|Date|number} options.stoppedAt - Thời điểm kết thúc phiên sạc
 * @param {number} [options.maxWaitMinutes=60] - Trần chờ tối đa (phút), mặc định 60
 * @param {number|Date} [options.now=Date.now()] - Thời điểm hiện tại để kiểm tra trần chờ
 * @returns {{
 *   hasIdle: boolean,
 *   isOpen: boolean,
 *   isCapped: boolean,
 *   billingReason: string|null,
 *   idleInterval: { from: string, to: string|null } | null
 * }}
 */
function resolveIdleInterval(events = [], { stoppedAt, maxWaitMinutes = 60, now = Date.now() } = {}) {
  const stoppedMs = typeof stoppedAt === 'number' ? stoppedAt : Date.parse(stoppedAt);
  const nowMs = typeof now === 'number' ? now : (now instanceof Date ? now.getTime() : Date.parse(now));
  const maxWaitMs = (Number.isFinite(maxWaitMinutes) ? maxWaitMinutes : 60) * 60 * 1000;

  if (!Number.isFinite(stoppedMs) || !Array.isArray(events) || events.length === 0) {
    return {
      hasIdle: false,
      isOpen: false,
      isCapped: false,
      billingReason: null,
      idleInterval: null,
    };
  }

  // Chuẩn hoá và sắp xếp sự kiện tăng dần theo thời gian
  const normalized = events
    .map((e) => ({
      atMs: Date.parse(e.occurred_at || e.occurredAt),
      iso: (e.occurred_at || e.occurredAt) ? new Date(e.occurred_at || e.occurredAt).toISOString() : null,
      status: e.ocpp_status || e.ocppStatus,
    }))
    .filter((e) => Number.isFinite(e.atMs) && typeof e.status === 'string')
    .sort((a, b) => a.atMs - b.atMs);

  if (normalized.length === 0) {
    return {
      hasIdle: false,
      isOpen: false,
      isCapped: false,
      billingReason: null,
      idleInterval: null,
    };
  }

  // Tách thành các chuỗi liên tục các sự kiện trong IDLE_SET
  let currentChain = null;
  const chains = [];

  for (let i = 0; i < normalized.length; i += 1) {
    const ev = normalized[i];
    const isIdle = IDLE_SET.has(ev.status);

    if (isIdle) {
      if (!currentChain) {
        currentChain = { fromEvent: ev, lastEvent: ev, exitEvent: null };
        chains.push(currentChain);
      } else {
        currentChain.lastEvent = ev;
      }
    } else if (currentChain) {
      currentChain.exitEvent = ev;
      currentChain = null;
    }
  }

  // Tìm chuỗi idle phù hợp cho phiên sạc:
  // "Khoảng chiếm = chuỗi liên tục các sự kiện trạng thái trong idle set của đúng đầu nối, bao stopped_at hoặc bắt đầu sau nó"
  let matchedChain = null;

  for (const chain of chains) {
    const fromMs = chain.fromEvent.atMs;
    const exitMs = chain.exitEvent ? chain.exitEvent.atMs : Infinity;

    // Chuỗi kết thúc hoàn toàn trước stoppedAt thì không tính
    if (exitMs <= stoppedMs) {
      continue;
    }

    // Nếu chuỗi bắt đầu tại hoặc trước stoppedAt nhưng kết thúc sau stoppedAt (hoặc chưa kết thúc)
    if (fromMs <= stoppedMs && exitMs > stoppedMs) {
      matchedChain = chain;
      break;
    }

    // Hoặc chuỗi bắt đầu tại hoặc sau stoppedAt
    if (fromMs >= stoppedMs) {
      matchedChain = chain;
      break;
    }
  }

  if (!matchedChain) {
    return {
      hasIdle: false,
      isOpen: false,
      isCapped: false,
      billingReason: null,
      idleInterval: null,
    };
  }

  const fromMs = matchedChain.fromEvent.atMs;
  const fromIso = matchedChain.fromEvent.iso;

  if (matchedChain.exitEvent) {
    // Đã có sự kiện rời idle set (ví dụ Available)
    return {
      hasIdle: true,
      isOpen: false,
      isCapped: false,
      billingReason: null,
      idleInterval: {
        from: fromIso,
        to: matchedChain.exitEvent.iso,
      },
    };
  }

  // Chưa có sự kiện rời idle set => Kiểm tra trần chờ IDLE_MAX_WAIT_MIN
  const cappedAtMs = fromMs + maxWaitMs;
  if (nowMs >= cappedAtMs) {
    return {
      hasIdle: true,
      isOpen: false,
      isCapped: true,
      billingReason: 'IDLE_CAPPED',
      idleInterval: {
        from: fromIso,
        to: new Date(cappedAtMs).toISOString(),
      },
    };
  }

  return {
    hasIdle: true,
    isOpen: true,
    isCapped: false,
    billingReason: null,
    idleInterval: {
      from: fromIso,
      to: null,
    },
  };
}

/**
 * Hàm đọc sự kiện từ DB (bảng connector_status_events)
 */
async function fetchConnectorStatusEvents(client, connectorId, { since = null } = {}) {
  const params = [connectorId];
  let sql = `
    SELECT id, charge_point_id, connector_id, connector_no, ocpp_status, error_code, occurred_at, received_at
    FROM connector_status_events
    WHERE connector_id = $1
  `;
  if (since) {
    params.push(since);
    sql += ` AND occurred_at >= $2::timestamptz`;
  }
  sql += ` ORDER BY occurred_at ASC, id ASC`;
  const result = await client.query(sql, params);
  return result.rows;
}

module.exports = {
  IDLE_SET,
  resolveIdleInterval,
  fetchConnectorStatusEvents,
};
