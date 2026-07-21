#!/usr/bin/env bash
set -euo pipefail

: "${MYSQL_HOST:?MYSQL_HOST is required}"
: "${MYSQL_PORT:?MYSQL_PORT is required}"
: "${MYSQL_USER:?MYSQL_USER is required}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"
: "${RESTORE_DATABASE:?RESTORE_DATABASE is required}"

case "$RESTORE_DATABASE" in
  (*[!a-zA-Z0-9_]*) echo "RESTORE_DATABASE contains invalid characters" >&2; exit 2 ;;
esac
if [[ "${RESTORE_DATABASE}" == "${MYSQL_DATABASE:-}" && "${ALLOW_IN_PLACE_RESTORE:-0}" != "1" ]]; then
  echo "Refusing an in-place restore without ALLOW_IN_PLACE_RESTORE=1" >&2
  exit 2
fi

backup_dir="${1:?usage: restore-mysql.sh BACKUP_DIRECTORY}"
(cd "$backup_dir" && sha256sum --check SHA256SUMS)
export MYSQL_PWD="$MYSQL_PASSWORD"
gzip -dc "$backup_dir/database.sql.gz" | mysql --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" "$RESTORE_DATABASE"

actual_manifest="$(mktemp)"
trap 'rm -f "$actual_manifest"; unset MYSQL_PWD' EXIT
mysql --batch --skip-column-names --host="$MYSQL_HOST" --port="$MYSQL_PORT" --user="$MYSQL_USER" "$RESTORE_DATABASE" <<'SQL' > "$actual_manifest"
select 'schedule_versions', count(*), coalesce(bit_xor(crc32(concat(hex(id), '|', hex(task_id), '|', version_number, '|', status, '|', hex(published_by), '|', date_format(published_at, '%Y-%m-%dT%H:%i:%s.%f')))), 0) from schedule_versions;
select 'group_member_events', count(*), coalesce(bit_xor(crc32(concat(hex(id), '|', hex(group_id), '|', hex(member_id), '|', event_type, '|', date_format(created_at, '%Y-%m-%dT%H:%i:%s.%f')))), 0) from group_member_events;
select 'audit_logs', count(*), coalesce(bit_xor(crc32(concat(hex(id), '|', action, '|', target_type, '|', coalesce(hex(target_id), ''), '|', date_format(created_at, '%Y-%m-%dT%H:%i:%s.%f')))), 0) from audit_logs;
SQL

awk 'NR == FNR { expected[NR] = $0; expected_count = NR; next } { line = NR - expected_count; if (line > expected_count || $0 != expected[line]) exit 1 } END { if (NR - expected_count != expected_count) exit 1 }' "$backup_dir/immutable-manifest.tsv" "$actual_manifest"
printf 'restore verification passed for %s\n' "$RESTORE_DATABASE"
