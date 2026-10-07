function getDefaultPool() {
  return require('./pool').pool;
}

async function withTransaction(fn, poolInstance = null) {
  const db = poolInstance || getDefaultPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
