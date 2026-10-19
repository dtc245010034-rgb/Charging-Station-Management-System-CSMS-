#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Cách dùng: tools/restore-db.sh <tệp-sao-lưu> <tên-cơ-sở-dữ-liệu-đích>" >&2
  exit 2
fi

archive="$1"
target_db="$2"
DB_USER="${POSTGRES_USER:-csms}"
ALLOW_PLAINTEXT="${BACKUP_ALLOW_PLAINTEXT:-0}"
if [[ ! "$target_db" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]]; then
  echo "Tên cơ sở dữ liệu đích không hợp lệ" >&2
  exit 2
fi
if [[ ! "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]]; then
  echo "POSTGRES_USER không hợp lệ" >&2
  exit 2
fi
if [ ! -f "$archive" ]; then
  echo "Không tìm thấy tệp sao lưu" >&2
  exit 2
fi
case "$archive" in
  *.sql.enc)
    if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
      echo "BACKUP_PASSPHRASE bắt buộc để giải mã" >&2
      exit 2
    fi
    command -v openssl >/dev/null 2>&1 || { echo "Cần cài openssl" >&2; exit 2; }
    ;;
  *.sql)
    if [ "$ALLOW_PLAINTEXT" != "1" ]; then
      echo "Chỉ khôi phục SQL rõ khi BACKUP_ALLOW_PLAINTEXT=1 trên máy dev" >&2
      exit 2
    fi
    ;;
  *)
    echo "Định dạng sao lưu phải là .sql.enc" >&2
    exit 2
    ;;
esac

if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose); else COMPOSE=(docker-compose); fi
cd "$(dirname "$0")/.."
database_exists="$("${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$target_db'")"
created=0
if [ -z "$database_exists" ]; then
  "${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"$target_db\" OWNER \"$DB_USER\" TEMPLATE template0"
  created=1
else
  table_count="$("${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d "$target_db" -tAc \
    "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f')")"
  if [ "$table_count" != "0" ]; then
    echo "Cơ sở dữ liệu đích phải trống; từ chối ghi đè" >&2
    exit 2
  fi
fi

cleanup_failed_restore() {
  status=$?
  if [ "$status" -ne 0 ] && [ "$created" -eq 1 ]; then
    "${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS \"$target_db\" WITH (FORCE)" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup_failed_restore EXIT

if [[ "$archive" == *.sql.enc ]]; then
  openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$archive" |
    "${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d "$target_db" -v ON_ERROR_STOP=1
else
  "${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d "$target_db" -v ON_ERROR_STOP=1 < "$archive"
fi
created=0
trap - EXIT
echo "Đã khôi phục vào cơ sở dữ liệu $target_db"
