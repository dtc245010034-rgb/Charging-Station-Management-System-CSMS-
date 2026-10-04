const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { BASE, run, query, resetSchema } = require('../helpers/db');
const { createOcppMessageHandler } = require('../../src/modules/ocpp/message-handler');
const { createMessageStore } = require('../../src/modules/ocpp/messages.repository');

const CODE = 'S14-CP-1';

describe('S-14: messageId xác định một CALL duy nhất trong thời gian lưu', () => {
	let pool;
	let chargePointId;
	let warnings;

	function makeConnection() {
		const sent = [];
		return {
			chargePointCode: CODE,
			chargePointId,
			isBootAccepted: true,
			send: (data, callback) => { sent.push(JSON.parse(data)); callback?.(); },
			sent,
		};
	}

	function makeServer(counter) {
		return createOcppMessageHandler({
			handlers: {
				StatusNotification: async ({ status }) => {
					counter.status += 1;
					if (counter.delay) await new Promise((resolve) => setTimeout(resolve, counter.delay));
					return { status, run: counter.status };
				},
				Heartbeat: async () => {
					counter.heartbeat += 1;
					return { run: counter.heartbeat };
				},
			},
			messageStore: createMessageStore(pool),
			logWarning: (line) => warnings.push(line),
			logError: () => {},
			logInfo: () => {},
		});
	}

	const call = (id, action, payload) => JSON.stringify([2, id, action, payload]);

	before(async () => {
		await resetSchema();
		assert.strictEqual(run('src/db/migrate.js').status, 0);
		pool = new Pool({ connectionString: BASE });
		const owner = await query(
			"INSERT INTO users (name, email, password_hash) VALUES ('Test owner', 's14-message-owner@test.invalid', 'unused') RETURNING id"
		);
		const station = await query(
			"INSERT INTO stations (name, address, owner_id) VALUES ('S14 station', 'test', $1) RETURNING id",
			[owner.rows[0].id]
		);
		const cp = await query(
			"INSERT INTO charge_points (station_id, code) VALUES ($1, $2) RETURNING id",
			[station.rows[0].id, CODE]
		);
		chargePointId = cp.rows[0].id;
	});

	after(async () => { await pool.end(); await resetSchema(); });
	beforeEach(async () => {
		warnings = [];
		await query('TRUNCATE ocpp_messages');
	});

	it('cùng messageId với payload khác nhận kết quả đầu tiên và ghi cảnh báo', async () => {
		const counter = { status: 0, heartbeat: 0 };
		const server = makeServer(counter);
		const connection = makeConnection();
		await server.handleMessage(connection, call('same-id', 'StatusNotification', { status: 'Available' }));
		await server.handleMessage(connection, call('same-id', 'StatusNotification', { status: 'Faulted' }));
		assert.equal(counter.status, 1);
		assert.deepEqual(connection.sent[1][2], connection.sent[0][2]);
		assert.ok(warnings.some((line) => line.includes('different content')));
	});

	it('hai request đồng thời có cùng ID nhưng khác payload cũng chỉ chạy một handler', async () => {
		const counter = { status: 0, heartbeat: 0, delay: 40 };
		const server = makeServer(counter);
		const connection = makeConnection();
		await Promise.all([
			server.handleMessage(connection, call('racing-id', 'StatusNotification', { status: 'Available' })),
			server.handleMessage(connection, call('racing-id', 'StatusNotification', { status: 'Faulted' })),
		]);
		assert.equal(counter.status, 1);
		assert.deepEqual(connection.sent[0][2], connection.sent[1][2]);
	});

	it('Heartbeat cũng được lưu và gửi lại response đã hoàn tất', async () => {
		const counter = { status: 0, heartbeat: 0 };
		const server = makeServer(counter);
		const connection = makeConnection();
		await server.handleMessage(connection, call('heartbeat-id', 'Heartbeat', {}));
		await server.handleMessage(connection, call('heartbeat-id', 'Heartbeat', {}));
		assert.equal(counter.heartbeat, 1);
		assert.deepEqual(connection.sent[1][2], connection.sent[0][2]);
		assert.equal((await query("SELECT count(*)::int AS n FROM ocpp_messages WHERE message_id = 'heartbeat-id'")).rows[0].n, 1);
	});

	it('không tái sử dụng ID chỉ vì câu trả lời đã cũ hơn cửa sổ replay ngắn', async () => {
		const counter = { status: 0, heartbeat: 0 };
		const server = makeServer(counter);
		await server.handleMessage(makeConnection(), call('old-id', 'StatusNotification', { status: 'Available' }));
		await query("UPDATE ocpp_messages SET created_at = CURRENT_TIMESTAMP - interval '11 minutes' WHERE message_id = 'old-id'");
		const retry = makeConnection();
		await server.handleMessage(retry, call('old-id', 'StatusNotification', { status: 'Available' }));
		assert.equal(counter.status, 1);
		assert.deepEqual(retry.sent[0][2], { status: 'Available', run: 1 });
	});
});
