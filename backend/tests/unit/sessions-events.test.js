const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  subscribe, publish, hasSubscriberFor, publishSessionUpdateFromDb, pendingCount,
} = require('../../src/modules/sessions/sessions.events');

const DRIVER = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sessionRow = (id, overrides = {}) => ({
  id,
  driver_id: String(DRIVER),
  charge_point_id: '1',
  station_id: '1',
  connector_id: '1',
  connector_no: 1,
  status: 'CHARGING',
  meter_start: '1000',
  latest_energy_value: '2000',
  latest_energy_unit: 'Wh',
  ...overrides,
});

describe('sessions.events: log lỗi', () => {
  it('truy vấn DB lỗi -> ghi log 1 lần, không ném lỗi', async () => {
    const off = subscribe(() => {}, { driverId: DRIVER });
    const logged = [];
    const failingPool = { query: async () => { throw new Error('db down'); } };
    try {
      await publishSessionUpdateFromDb(1, {
        pool: failingPool, driverId: DRIVER, logError: (...args) => logged.push(args.join(' ')),
      });
    } finally {
      off();
    }
    assert.equal(logged.length, 1);
    assert.match(logged[0], /db down/);
  });

  it('formatSession ném lỗi -> ghi log, không ném lỗi', async () => {
    const off = subscribe(() => {}, { driverId: DRIVER });
    const logged = [];
    const pool = { query: async () => ({ rows: [sessionRow(1, { status: 'COMPLETED', meter_start: '1.5', meter_stop: '3' })] }) };
    try {
      await publishSessionUpdateFromDb(1, {
        pool, driverId: DRIVER, logError: (...args) => logged.push(args.join(' ')),
      });
    } finally {
      off();
    }
    assert.equal(logged.length, 1);
  });

  it('chính logError ném lỗi -> vẫn không reject và hàng đợi vẫn được dọn', async () => {
    const off = subscribe(() => {}, { driverId: DRIVER });
    const failingPool = { query: async () => { throw new Error('db down'); } };
    try {
      await assert.doesNotReject(publishSessionUpdateFromDb(1, {
        pool: failingPool, driverId: DRIVER, logError() { throw new Error('logger hỏng'); },
      }));
    } finally {
      off();
    }
    assert.equal(pendingCount(), 0);
  });
});

describe('sessions.events: định tuyến theo tài xế (G9)', () => {
  it('subscribe thiếu driverId -> ném TypeError', () => {
    assert.throws(() => subscribe(() => {}), TypeError);
  });

  it('hasSubscriberFor so khớp theo chuỗi và trả false cho null/undefined', () => {
    const off = subscribe(() => {}, { driverId: 5 });
    try {
      assert.equal(hasSubscriberFor(5), true);
      assert.equal(hasSubscriberFor('5'), true);
      assert.equal(hasSubscriberFor(6), false);
      assert.equal(hasSubscriberFor(null), false);
      assert.equal(hasSubscriberFor(undefined), false);
    } finally {
      off();
    }
  });

  it('100 tin của tài xế khác -> 0 truy vấn, 0 sự kiện', async () => {
    let queries = 0;
    const pool = { query: async () => { queries += 1; return { rows: [sessionRow(7)] }; } };
    const received = [];
    const off = subscribe((event) => received.push(event), { driverId: DRIVER });
    try {
      for (let i = 0; i < 100; i += 1) await publishSessionUpdateFromDb(7, { pool, driverId: 999 });
    } finally {
      off();
    }
    assert.equal(queries, 0);
    assert.equal(received.length, 0);
  });

  it('100 tin của đúng tài xế đang nghe -> đúng 1 truy vấn và 1 sự kiện mỗi tin', async () => {
    let queries = 0;
    const pool = { query: async () => { queries += 1; return { rows: [sessionRow(7)] }; } };
    const received = [];
    const off = subscribe((event) => received.push(event), { driverId: DRIVER });
    try {
      for (let i = 0; i < 100; i += 1) await publishSessionUpdateFromDb(7, { pool, driverId: DRIVER });
    } finally {
      off();
    }
    assert.equal(queries, 100);
    assert.equal(received.length, 100);
  });

  it('publish chỉ tới listener của đúng tài xế', () => {
    const forFive = [];
    const forSix = [];
    const offFive = subscribe((event) => forFive.push(event), { driverId: 5 });
    const offSix = subscribe((event) => forSix.push(event), { driverId: 6 });
    try {
      publish({ driverId: 5, sessionId: 1 });
    } finally {
      offFive();
      offSix();
    }
    assert.equal(forFive.length, 1);
    assert.equal(forSix.length, 0);
  });

  it('listener ném lỗi bị gỡ, listener khác vẫn nhận', () => {
    const received = [];
    const offBad = subscribe(() => { throw new Error('hỏng'); }, { driverId: 5 });
    const offGood = subscribe((event) => received.push(event), { driverId: 5 });
    try {
      publish({ driverId: 5, sessionId: 1 });
      publish({ driverId: 5, sessionId: 2 });
    } finally {
      offBad();
      offGood();
    }
    assert.equal(received.length, 2);
  });

  it('tài xế rời đi trong lúc đang truy vấn -> không phát', async () => {
    const received = [];
    const off = subscribe((event) => received.push(event), { driverId: DRIVER });
    const pool = { query: async () => { await sleep(30); return { rows: [sessionRow(7)] }; } };
    const pending = publishSessionUpdateFromDb(7, { pool, driverId: DRIVER });
    off();
    await pending;
    assert.equal(received.length, 0);
  });
});

describe('sessions.events: thứ tự và hàng đợi theo phiên (N2)', () => {
  it('lần gọi chậm (CHARGING) gọi trước thì vẫn tới trước lần COMPLETED', async () => {
    let calls = 0;
    const pool = {
      query: async () => {
        calls += 1;
        if (calls === 1) {
          await sleep(60);
          return { rows: [sessionRow(7, { status: 'CHARGING' })] };
        }
        return { rows: [sessionRow(7, { status: 'COMPLETED', meter_stop: '3000' })] };
      },
    };
    const statuses = [];
    const off = subscribe((event) => statuses.push(event.status), { driverId: DRIVER });
    try {
      const first = publishSessionUpdateFromDb(7, { pool, driverId: DRIVER });
      const second = publishSessionUpdateFromDb(7, { pool, driverId: DRIVER });
      await Promise.all([first, second]);
    } finally {
      off();
    }
    assert.deepEqual(statuses, ['CHARGING', 'COMPLETED']);
  });

  it('phiên chậm không chặn phiên khác', async () => {
    const pool = {
      query: async (_sql, [id]) => {
        if (id === 1) await sleep(60);
        return { rows: [sessionRow(id)] };
      },
    };
    const order = [];
    const off = subscribe((event) => order.push(event.sessionId), { driverId: DRIVER });
    try {
      await Promise.all([
        publishSessionUpdateFromDb(1, { pool, driverId: DRIVER }),
        publishSessionUpdateFromDb(2, { pool, driverId: DRIVER }),
      ]);
    } finally {
      off();
    }
    assert.deepEqual(order, [2, 1]);
  });

  it('một lần lỗi không làm hỏng hàng đợi của lần sau', async () => {
    let calls = 0;
    const pool = {
      query: async () => {
        calls += 1;
        if (calls === 1) throw new Error('lỗi tạm');
        return { rows: [sessionRow(7)] };
      },
    };
    const received = [];
    const off = subscribe((event) => received.push(event), { driverId: DRIVER });
    try {
      await publishSessionUpdateFromDb(7, { pool, driverId: DRIVER, logError() {} });
      await publishSessionUpdateFromDb(7, { pool, driverId: DRIVER, logError() {} });
    } finally {
      off();
    }
    assert.equal(received.length, 1);
  });

  it('hàng đợi được dọn sau khi xong (không rò bộ nhớ)', async () => {
    const pool = { query: async () => ({ rows: [sessionRow(7)] }) };
    const off = subscribe(() => {}, { driverId: DRIVER });
    try {
      await Promise.all([
        publishSessionUpdateFromDb(7, { pool, driverId: DRIVER }),
        publishSessionUpdateFromDb(7, { pool, driverId: DRIVER }),
        publishSessionUpdateFromDb(8, { pool, driverId: DRIVER }),
      ]);
    } finally {
      off();
    }
    assert.equal(pendingCount(), 0);
  });
});
