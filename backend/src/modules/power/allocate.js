function compareSessionId(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  if (/^\d+$/.test(leftText) && /^\d+$/.test(rightText)) {
    const leftId = BigInt(leftText);
    const rightId = BigInt(rightText);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  }
  return leftText.localeCompare(rightText);
}

function allocate({ limitW, sessions }) {
  if (!Number.isSafeInteger(limitW) || limitW < 0 || !Array.isArray(sessions)) {
    throw new TypeError('limitW must be a non-negative safe integer and sessions must be an array');
  }
  const ordered = sessions.map((session) => {
    if (!session || !Number.isSafeInteger(session.ratedW) || session.ratedW < 0
      || session.sessionId === undefined || session.sessionId === null) {
      throw new TypeError('Each session requires an ID and a non-negative safe integer ratedW');
    }
    return { sessionId: session.sessionId, ratedW: session.ratedW };
  }).sort((left, right) => left.ratedW - right.ratedW || compareSessionId(left.sessionId, right.sessionId));

  const totalRatedW = ordered.reduce((total, session) => total + BigInt(session.ratedW), 0n);
  if (totalRatedW <= BigInt(limitW)) {
    return ordered.map(({ sessionId, ratedW }) => ({ sessionId, limitW: ratedW }));
  }

  let remainingW = BigInt(limitW);
  return ordered.map(({ sessionId, ratedW }, index) => {
    const rated = BigInt(ratedW);
    const remainingSessions = BigInt(ordered.length - index);
    const shareW = (remainingW / remainingSessions / 100n) * 100n;
    const assignedW = rated < shareW ? rated : shareW;
    remainingW -= assignedW;
    return { sessionId, limitW: Number(assignedW) };
  });
}

module.exports = { allocate };
