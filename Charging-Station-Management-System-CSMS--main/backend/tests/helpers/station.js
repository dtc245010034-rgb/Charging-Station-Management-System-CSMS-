const request = require('supertest');
const { app } = require('./app');

let seq = 0;

const stationBody = (overrides = {}) => ({
  name: 'Trạm test', address: 'Hà Nội', latitude: 21.03, longitude: 105.85, ...overrides,
});
const idempotencyKey = () => `test-key-${process.pid}-${Date.now()}-${++seq}`;

// Tạo trạm đúng hợp đồng API: có toạ độ và Idempotency-Key.
const postStation = (user, body = stationBody(), key = idempotencyKey()) => request(app)
  .post('/api/stations').set('Cookie', user.cookie).set('Idempotency-Key', key).send(body);

module.exports = { stationBody, idempotencyKey, postStation };
