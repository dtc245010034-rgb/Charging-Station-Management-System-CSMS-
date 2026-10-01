const SUPPORTED_PROTOCOL = 'ocpp1.6';

function rejectHandshake(socket, statusCode, statusText) {
	if (socket.destroyed) return;
	socket.end(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function protocolsFromHeader(header) {
	return String(header || '').split(',').map((protocol) => protocol.trim()).filter(Boolean);
}

function createOcppUpgradeHandler({ wss, lookupChargePoint, logWarning = console.warn, logError = console.error }) {
	return async (request, socket, head) => {
		let pathname;
		try {
			pathname = new URL(request.url, 'http://localhost').pathname;
		} catch {
			socket.destroy();
			return;
		}

		const match = pathname.match(/^\/ocpp\/([^/]+)$/);
		if (!match) return socket.destroy();

		let code;
		try {
			code = decodeURIComponent(match[1]).trim().toUpperCase();
		} catch {
			rejectHandshake(socket, 400, 'Bad Request');
			return;
		}
		if (!code || code.includes('/')) {
			rejectHandshake(socket, 400, 'Bad Request');
			return;
		}

		if (!protocolsFromHeader(request.headers['sec-websocket-protocol']).includes(SUPPORTED_PROTOCOL)) {
			rejectHandshake(socket, 400, 'Bad Request');
			return;
		}

		let chargePoint;
		try {
			chargePoint = await lookupChargePoint(code);
		} catch (error) {
			logError('[OCPP] Charge point lookup failed:', error.message);
			rejectHandshake(socket, 503, 'Service Unavailable');
			return;
		}

		if (!chargePoint) {
			const clientIp = request.socket.remoteAddress || 'UNKNOWN_IP';
			logWarning(`[SECURITY_WARN] Unauthorized WebSocket attempt | IP: ${clientIp} | ChargePointCode: ${JSON.stringify(code)}`);
			rejectHandshake(socket, 403, 'Forbidden');
			return;
		}

		wss.handleUpgrade(request, socket, head, (ws) => {
			ws.chargePoint = chargePoint;
			ws.stationStatus = chargePoint.station_status;
			wss.emit('connection', ws, code);
		});
	};
}

module.exports = { createOcppUpgradeHandler };