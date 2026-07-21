#!/usr/bin/env bash
set -euo pipefail

: "${MYSQL_HOST:?MYSQL_HOST is required}"
: "${MYSQL_PORT:?MYSQL_PORT is required}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"

case "$MYSQL_DATABASE" in
  (*[!a-zA-Z0-9_]*) echo "MYSQL_DATABASE contains invalid characters" >&2; exit 2 ;;
esac

output_root="${1:-./backups}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$output_root/$timestamp"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
export MYSQL_PWD="$MYSQL_PASSWORD"

mysqldump \
  --host="$MYSQL_HOST" \
  --port="$MYSQL_PORT" \
  --user="$MYSQL_USER" \
  --single-transaction \
  --routines \
  --events \
  --hex-blob \
  --no-tablespaces \
  --set-gtid-purged=OFF \
  "$MYSQL_DATABASE" | gzip -9 > "$backup_dir/database.sql.gz"

mysql --batch --skip-column-names --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" "$MYSQL_DATABASE" <<'SQL' > "$backup_dir/immutable-manifest.tsv"
select 'schedule_versions', count(*), coalesce(bit_xor(crc32(concat(hex(id), '|', hex(task_id), '|', version_number, '|', status, '|', hex(published_by), '|', date_format(published_at, '%Y-%m-%dT%H:%i:%s.%f')))), 0) from schedule_versions;
select 'group_member_events', count(*), coalesce(bit_xor(crc32(concat(hex(id), '|', hex(group_id), '|', hex(member_id), '|', event_type, '|', date_format(created_at, '%Y-%m-%dT%H:%i:%s.%f')))), 0) from group_member_events;
select 'audit_logs', count(*), coalesce(bit_xor(crc32(concat(hex(id), '|', action, '|', target_type, '|', coalesce(hex(target_id), ''), '|', date_format(created_at, '%Y-%m-%dT%H:%i:%s.%f')))), 0) from audit_logs;
SQL

(cd "$backup_dir" && sha256sum database.sql.gz immutable-manifest.tsv > SHA256SUMS)
unset MYSQL_PWD
printf '%s\n' "$backup_dir"
