const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const {
	createConnectionRateLimiter,
	registerOcppConnection,
} = require('../../src/modules/ocpp/ws-connection');

describe('T-44a / D7: Token Bucket Rate Limiter cho kết nối OCPP', () => {
	it('400 tin tuần tự không bị đóng (burst 400 tin liên tiếp được chấp nhận)', () => {
		let currentTime = 10000;
		const limiter = createConnectionRateLimiter({
			maxMessagesPerSecond: 50,
			burstCapacity: 400,
			now: () => currentTime,
		});

		for (let i = 0; i < 400; i += 1) {
			const allowed = limiter.checkLimit();
			assert.equal(allowed, true, `Tin thứ ${i + 1} phải được chấp nhận`);
		}

		assert.equal(limiter.isExceeded(), false);
	});

	it('xả 2000 tin/giây vẫn bị đóng (vượt trần burst và refill rate bị từ chối)', () => {
		let currentTime = 10000;
		const limiter = createConnectionRateLimiter({
			maxMessagesPerSecond: 50,
			burstCapacity: 400,
			now: () => currentTime,
		});

		let acceptedCount = 0;
		let rejectedCount = 0;

		// Bắn 2000 tin trong 1 giây (mỗi tin cách nhau 0.5ms)
		for (let i = 0; i < 2000; i += 1) {
			currentTime += 0.5;
			if (limiter.checkLimit()) {
				acceptedCount += 1;
			} else {
				rejectedCount += 1;
			}
		}

		// Burst tối đa 400 + nạp trong 1 giây 50 = tối đa ~450 tin
		assert.ok(acceptedCount <= 451, `Số tin chấp nhận (${acceptedCount}) không được vượt trần 450`);
		assert.ok(rejectedCount > 1500, `Phần lớn tin xả dồn dập phải bị từ chối (bị từ chối: ${rejectedCount})`);
		assert.equal(limiter.isExceeded(), true);
	});

	it('token được nạp lại theo thời gian tương ứng tốc độ refillRate', () => {
		let currentTime = 10000;
		const limiter = createConnectionRateLimiter({
			maxMessagesPerSecond: 50,
			burstCapacity: 400,
			now: () => currentTime,
		});

		// Dùng hết 400 tokens
		for (let i = 0; i < 400; i += 1) {
			limiter.checkLimit();
		}

		// Tin 401 tại cùng mốc thời gian phải bị chặn
		assert.equal(limiter.checkLimit(), false);

		// Chờ 2 giây (2000ms) -> nạp thêm 2 * 50 = 100 tokens
		currentTime += 2000;
		const freshLimiter = createConnectionRateLimiter({
			maxMessagesPerSecond: 50,
			burstCapacity: 400,
			now: () => currentTime,
		});

		// Tiêu thụ hết 400
		for (let i = 0; i < 400; i += 1) {
			freshLimiter.checkLimit();
		}
		// Tiến 1000ms -> nạp lại 50 tokens
		currentTime += 1000;
		for (let i = 0; i < 50; i += 1) {
			assert.equal(freshLimiter.checkLimit(), true, `Tin thứ ${i + 1} sau khi nạp lại phải được chấp nhận`);
		}
		// Tin 51 sau khi hết token vừa nạp phải bị chặn
		assert.equal(freshLimiter.checkLimit(), false);
	});

	it('registerOcppConnection đóng socket với code 1008 khi vượt ngưỡng rate limit', () => {
		let currentTime = 10000;
		const ws = new EventEmitter();
		ws.readyState = 1;
		ws.close = (code, reason) => {
			ws.closedWithCode = code;
			ws.closedWithReason = reason;
		};

		const connections = {
			connect: () => {},
			disconnect: () => true,
		};
		const ocppMessages = {
			handleMessage: () => {},
			closeConnection: () => {},
		};

		registerOcppConnection(ws, 'CP-TEST-RATE', {
			connections,
			ocppMessages,
			rateLimitMax: 50,
			now: () => currentTime,
			logWarning: () => {},
		});

		// Gửi 400 tin -> không bị đóng
		for (let i = 0; i < 400; i += 1) {
			ws.emit('message', JSON.stringify([2, `msg-${i}`, 'Heartbeat', {}]));
		}
		assert.equal(ws.closedWithCode, undefined);

		// Gửi tiếp tin thứ 401 khi chưa kịp nạp -> bị đóng với 1008
		ws.emit('message', JSON.stringify([2, 'msg-overflow', 'Heartbeat', {}]));
		assert.equal(ws.closedWithCode, 1008);
		assert.match(ws.closedWithReason, /Rate limit exceeded/);
	});
});
