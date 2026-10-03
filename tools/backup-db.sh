#!/usr/bin/env bash
# Sao lưu Postgres của CSMS bằng pg_dump, giữ KEEP bản mới nhất (mặc định 7).
# Chạy trong thư mục dự án: tools/backup-db.sh   (đọc POSTGRES_USER/POSTGRES_DB từ môi trường, mặc định csms/csms)
# File sao lưu chứa dữ liệu cá nhân: nằm ngoài repo (mặc định ~/csms-backups), quyền 600, không commit, không gửi công khai.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/csms-backups}"
KEEP="${KEEP:-7}"
DB_USER="${POSTGRES_USER:-csms}"
DB_NAME="${POSTGRES_DB:-csms}"

case "$KEEP" in ''|*[!0-9]*|0) echo "KEEP phải là số nguyên dương" >&2; exit 2;; esac
if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose); else COMPOSE=(docker-compose); fi
cd "$(dirname "$0")/.."
umask 077
mkdir -p "$BACKUP_DIR"

target="$BACKUP_DIR/csms-$(date +%Y%m%d-%H%M%S).sql"
partial="$target.partial"
trap 'rm -f "$partial"' EXIT

"${COMPOSE[@]}" exec -T db pg_dump -U "$DB_USER" "$DB_NAME" > "$partial"
[ -s "$partial" ] || { echo "Bản sao lưu rỗng, bỏ qua" >&2; exit 1; }
mv "$partial" "$target"
trap - EXIT
echo "Đã sao lưu: $target ($(wc -c < "$target") byte)"

ls -1t "$BACKUP_DIR"/csms-*.sql 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f -- "$old"; done
echo "Còn $(ls -1 "$BACKUP_DIR"/csms-*.sql | wc -l) bản (giữ tối đa $KEEP)"
