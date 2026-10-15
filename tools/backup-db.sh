#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/csms-backups}"
KEEP="${KEEP:-7}"
DB_USER="${POSTGRES_USER:-csms}"
DB_NAME="${POSTGRES_DB:-csms}"
ALLOW_PLAINTEXT="${BACKUP_ALLOW_PLAINTEXT:-0}"

secure_file() {
  chmod 600 "$1"
  case "${OSTYPE:-}" in
    msys*|cygwin*)
      command -v icacls.exe >/dev/null 2>&1 || { echo "Cần icacls để giới hạn quyền tệp sao lưu trên Windows" >&2; return 1; }
      [ -n "${USERNAME:-}" ] || { echo "USERNAME bắt buộc để giới hạn quyền tệp sao lưu trên Windows" >&2; return 1; }
      icacls.exe "$(cygpath -w "$1")" /inheritance:r /grant:r "$USERNAME:(F)" >/dev/null
      ;;
  esac
}

case "$KEEP" in ''|*[!0-9]*|0) echo "KEEP phải là số nguyên dương" >&2; exit 2;; esac
if [ -z "${BACKUP_PASSPHRASE:-}" ] && [ "$ALLOW_PLAINTEXT" != "1" ]; then
  echo "BACKUP_PASSPHRASE bắt buộc; BACKUP_ALLOW_PLAINTEXT=1 chỉ dành cho máy dev" >&2
  exit 2
fi
if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose); else COMPOSE=(docker-compose); fi
cd "$(dirname "$0")/.."
umask 077
mkdir -p "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  target="$BACKUP_DIR/csms-$stamp.sql.enc"
else
  target="$BACKUP_DIR/csms-$stamp.sql"
fi
partial="$target.partial"
dump="$(mktemp "$BACKUP_DIR/.csms-dump.XXXXXX")"
trap 'rm -f "$partial" "$dump"' EXIT
secure_file "$dump"

"${COMPOSE[@]}" exec -T db pg_dump -U "$DB_USER" "$DB_NAME" > "$dump"
[ -s "$dump" ] || { echo "Bản sao lưu rỗng, bỏ qua" >&2; exit 1; }
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -pass env:BACKUP_PASSPHRASE -in "$dump" -out "$partial"
else
  cp "$dump" "$partial"
fi
secure_file "$partial"
mv "$partial" "$target"
rm -f "$dump"
trap - EXIT
echo "Đã sao lưu: $target ($(wc -c < "$target") byte)"

ls -1t "$BACKUP_DIR"/csms-*.sql* 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do rm -f -- "$old"; done
echo "Còn $(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'csms-*.sql*' | wc -l) bản (giữ tối đa $KEEP)"
