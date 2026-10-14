const { withTransaction } = require('../../db/tx');
const { pool } = require('../../db/pool');
const env = require('../../config/env');
const { sanitizeErrorMessage } = require('../../lib/constants');
const audit = require('../audit/audit.repository');

async function runWalletAudit(db = pool) {
  const wallets = await db.query(
    `SELECT w.driver_id
     FROM wallets w
     ORDER BY w.driver_id`
  );

  let mismatches = 0;
  let locked = 0;
  for (const candidate of wallets.rows) {
    const result = await withTransaction(async (client) => {
      const walletResult = await client.query(
        'SELECT driver_id, balance_dong, locked, locked_reason FROM wallets WHERE driver_id = $1 FOR UPDATE',
        [candidate.driver_id]
      );
      const wallet = walletResult.rows[0];
      if (!wallet) return null;

      const ledgerResult = await client.query(
        'SELECT COALESCE(SUM(amount_dong), 0)::text AS balance FROM wallet_ledger WHERE driver_id = $1',
        [candidate.driver_id]
      );
      const ledgerBalance = BigInt(ledgerResult.rows[0].balance);
      const walletBalance = BigInt(wallet.balance_dong);
      if (ledgerBalance === walletBalance) return null;

      const alreadyAudited = wallet.locked && wallet.locked_reason === 'LEDGER_MISMATCH';
      if (alreadyAudited) return { mismatch: true, locked: false };

      await client.query(
        `UPDATE wallets
         SET locked = TRUE,
             locked_reason = 'LEDGER_MISMATCH',
             locked_at = COALESCE(locked_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE driver_id = $1`,
        [candidate.driver_id]
      );
      await audit.record(
        null,
        'WALLET_MISMATCH',
        'wallet',
        candidate.driver_id,
        {
          driver_id: String(candidate.driver_id),
          expected_balance_dong: ledgerBalance.toString(),
          actual_balance_dong: walletBalance.toString(),
        },
        null,
        client
      );
      return { mismatch: true, locked: true };
    }, db);

    if (result?.mismatch) mismatches += 1;
    if (result?.locked) locked += 1;
  }

  return { checked: wallets.rowCount, mismatches, locked };
}

function startWalletAuditJob({
  db = pool,
  intervalMs = env.WALLET_AUDIT_INTERVAL_MS,
  logInfo = console.info,
  logError = console.error,
} = {}) {
  let running = null;

  async function run() {
    if (running) return running;
    running = (async () => {
      try {
        const result = await runWalletAudit(db);
        if (result.mismatches > 0) {
          logInfo(`[Wallet audit] Phát hiện ${result.mismatches} ví lệch sổ cái; đã khóa ${result.locked} ví`);
        }
      } catch (error) {
        logError(`[Wallet audit] Không thể kiểm định ví: ${sanitizeErrorMessage(error?.message || error)}`);
      }
    })().finally(() => { running = null; });
    return running;
  }

  const timer = setInterval(() => { void run(); }, intervalMs);
  timer.unref?.();
  void run();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = { runWalletAudit, startWalletAuditJob };
