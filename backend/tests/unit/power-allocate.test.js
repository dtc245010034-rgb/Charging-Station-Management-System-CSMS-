const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { allocate } = require('../../src/modules/power/allocate');

const cases = [
  {
    name: 'P01',
    limitW: 22000,
    sessions: [
      { sessionId: 3, ratedW: 22000 },
      { sessionId: 1, ratedW: 7400 },
      { sessionId: 2, ratedW: 11000 },
    ],
    expected: [
      { sessionId: 1, limitW: 7300 },
      { sessionId: 2, limitW: 7300 },
      { sessionId: 3, limitW: 7400 },
    ],
  },
  {
    name: 'P02',
    limitW: 22000,
    sessions: [
      { sessionId: 3, ratedW: 22000 },
      { sessionId: 1, ratedW: 3700 },
      { sessionId: 2, ratedW: 11000 },
    ],
    expected: [
      { sessionId: 1, limitW: 3700 },
      { sessionId: 2, limitW: 9100 },
      { sessionId: 3, limitW: 9200 },
    ],
  },
  {
    name: 'P03',
    limitW: 11000,
    sessions: [4, 3, 2, 1].map((sessionId) => ({ sessionId, ratedW: 22000 })),
    expected: [
      { sessionId: 1, limitW: 2700 },
      { sessionId: 2, limitW: 2700 },
      { sessionId: 3, limitW: 2800 },
      { sessionId: 4, limitW: 2800 },
    ],
  },
  {
    name: 'P04',
    limitW: 22000,
    sessions: [{ sessionId: 2, ratedW: 7400 }, { sessionId: 1, ratedW: 7400 }],
    expected: [{ sessionId: 1, limitW: 7400 }, { sessionId: 2, limitW: 7400 }],
  },
  {
    name: 'P05',
    limitW: 22000,
    sessions: [{ sessionId: 1, ratedW: 22000 }],
    expected: [{ sessionId: 1, limitW: 22000 }],
  },
];

describe('power allocation', () => {
  for (const item of cases) {
    it(`${item.name}: matches the prescribed allocation answer`, () => {
      assert.deepStrictEqual(allocate({ limitW: item.limitW, sessions: item.sessions }), item.expected);
    });
  }

  it('keeps allocation within the cap, each rating, and 100-watt units for seeded inputs', () => {
    let seed = 0x42c0ffee;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };

    for (let sample = 0; sample < 500; sample += 1) {
      const limitW = (1 + (random() % 1500)) * 100;
      const sessions = Array.from({ length: 1 + (random() % 12) }, (_, index) => ({
        sessionId: index + 1,
        ratedW: (1 + (random() % 2200)) * 100,
      }));
      const result = allocate({ limitW, sessions });
      assert.ok(result.reduce((sum, item) => sum + item.limitW, 0) <= limitW);
      for (const item of result) {
        const source = sessions.find((session) => session.sessionId === item.sessionId);
        assert.ok(item.limitW <= source.ratedW);
        assert.strictEqual(item.limitW % 100, 0);
      }
    }
  });

  it('uses numeric session ID order to break equal-rating ties', () => {
    assert.deepStrictEqual(allocate({
      limitW: 2000,
      sessions: [
        { sessionId: '10', ratedW: 3000 },
        { sessionId: '2', ratedW: 3000 },
      ],
    }), [
      { sessionId: '2', limitW: 1000 },
      { sessionId: '10', limitW: 1000 },
    ]);
  });
});
