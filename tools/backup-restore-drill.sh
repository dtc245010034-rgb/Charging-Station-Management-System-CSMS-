#!/usr/bin/env bash
set -euo pipefail

DB_USER="${POSTGRES_USER:-csms}"
DB_NAME="${POSTGRES_DB:-csms}"
RESTORE_DB="csms_restore_check"
BACKUP_DIR="${BACKUP_DIR:-$HOME/csms-backups}"

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  echo "BACKUP_PASSPHRASE bắt buộc để chạy drill" >&2
  exit 2
fi
if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose); else COMPOSE=(docker-compose); fi
cd "$(dirname "$0")/.."

exists="$("${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = '$RESTORE_DB'")"
if [ -n "$exists" ]; then
  echo "Cơ sở dữ liệu tạm $RESTORE_DB đã tồn tại; không tự xoá dữ liệu" >&2
  exit 2
fi

created=0
cleanup() {
  status=$?
  if [ "$created" -eq 1 ]; then
    "${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\" WITH (FORCE)" >/dev/null
  fi
  exit "$status"
}
trap cleanup EXIT

BACKUP_DIR="$BACKUP_DIR" tools/backup-db.sh
archive="$(ls -1t "$BACKUP_DIR"/csms-*.sql.enc | head -n 1)"
if [ -z "$archive" ]; then
  echo "Không tìm thấy bản sao lưu mã hoá vừa tạo" >&2
  exit 1
fi
BACKUP_DIR="$BACKUP_DIR" tools/restore-db.sh "$archive" "$RESTORE_DB"
created=1

source_stats="$("${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -tA -F '|' -c "
  SELECT 'users', count(*) FROM users
  UNION ALL SELECT 'charging_sessions', count(*) FROM charging_sessions
  UNION ALL SELECT 'session_invoices', count(*) FROM session_invoices
  UNION ALL SELECT 'wallets', count(*) FROM wallets
  UNION ALL SELECT 'wallet_ledger', count(*) FROM wallet_ledger
  UNION ALL SELECT 'ledger_sum', COALESCE(sum(amount_dong), 0) FROM wallet_ledger
  UNION ALL SELECT 'balance_sum', COALESCE(sum(balance_dong), 0) FROM wallets
")"
restored_stats="$("${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d "$RESTORE_DB" -v ON_ERROR_STOP=1 -tA -F '|' -c "
  SELECT 'users', count(*) FROM users
  UNION ALL SELECT 'charging_sessions', count(*) FROM charging_sessions
  UNION ALL SELECT 'session_invoices', count(*) FROM session_invoices
  UNION ALL SELECT 'wallets', count(*) FROM wallets
  UNION ALL SELECT 'wallet_ledger', count(*) FROM wallet_ledger
  UNION ALL SELECT 'ledger_sum', COALESCE(sum(amount_dong), 0) FROM wallet_ledger
  UNION ALL SELECT 'balance_sum', COALESCE(sum(balance_dong), 0) FROM wallets
")"
if [ "$source_stats" != "$restored_stats" ]; then
  echo "DRILL FAIL: số liệu DB nguồn và DB khôi phục không khớp" >&2
  printf '%s\n' "$source_stats" "$restored_stats" >&2
  exit 1
fi
ledger_sum="$(printf '%s\n' "$source_stats" | awk -F '|' '$1 == "ledger_sum" {print $2}')"
balance_sum="$(printf '%s\n' "$source_stats" | awk -F '|' '$1 == "balance_sum" {print $2}')"
if [ "$ledger_sum" != "$balance_sum" ]; then
  echo "DRILL FAIL: tổng sổ cái không khớp tổng số dư ví" >&2
  printf 'ledger_sum=%s balance_sum=%s\n' "$ledger_sum" "$balance_sum" >&2
  exit 1
fi

printf 'DRILL PASS: số dòng khôi phục khớp DB nguồn; ledger_sum=%s balance_sum=%s\n' "$ledger_sum" "$balance_sum"
printf '%s\n' "$source_stats"
