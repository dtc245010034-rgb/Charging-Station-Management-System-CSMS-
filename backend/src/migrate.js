const { migrate, rollbackLastMigration, pool, seedAdminPassword } = require('./db');

(async () => {
  try {
    if (process.argv[2] === 'down') {
      await rollbackLastMigration();
    } else {
      await migrate();
      await seedAdminPassword();
    }
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
