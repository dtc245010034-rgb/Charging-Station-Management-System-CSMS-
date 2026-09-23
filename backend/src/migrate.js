const { migrate, rollbackLastMigration, pool } = require('./db');

(async () => {
  try {
    if (process.argv[2] === 'down') {
      await rollbackLastMigration();
    } else {
      await migrate();
    }
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
