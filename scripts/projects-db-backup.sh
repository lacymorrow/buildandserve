#!/usr/bin/env bash
# Nightly projects-db backup: one pg_dump per database, pushed to the library NAS.
# Runs ON the bas box as root. Installed at /usr/local/bin/projects-db-backup.sh.
#
#   (no args)                     dump every database, prune, push to the NAS
#   install                       write the systemd units and enable the timer
#   restore <dumpfile> <target>   restore one dump into a database that does not exist
#   verify-restore [db]           restore the newest local dump into a scratch
#                                 database, compare row counts, drop the scratch
#
# Push, not pull. The box already pushes chatwoot and the Paperclip database to the
# same NAS through /etc/paperclip/library_backup_ed25519, so this copies a working
# pattern instead of provisioning a second rrsync key on the NAS. The template is
# /usr/local/bin/chatwoot-backup.sh (LAC-4165) and this keeps its shape: dump,
# local prune, rsync, remote prune, chown, logger.
#
# A dump nobody has restored is not a backup, which is why `verify-restore` is in
# here rather than in a runbook step somebody does once. See
# docs/ops/projects-db-backups.md.
set -euo pipefail
umask 077

CONTAINER="${PROJECTS_DB_CONTAINER:-projects-db}"
LOCAL_ROOT="${PROJECTS_DB_BACKUP_DIR:-/data/backups/projects}"
LOCAL_KEEP_DAYS="${PROJECTS_DB_LOCAL_KEEP_DAYS:-7}"
NAS_KEY="${PROJECTS_DB_NAS_KEY:-/etc/paperclip/library_backup_ed25519}"
NAS_HOST="${PROJECTS_DB_NAS_HOST:-root@100.119.64.141}"
NAS_DIR="${PROJECTS_DB_NAS_DIR:-/mnt/user/backups/projects-db-bas}"
NAS_KEEP_DAYS="${PROJECTS_DB_NAS_KEEP_DAYS:-14}"
# 99:100 is nobody:users on Unraid. Without it the pushed files are owned by root
# and the array's own tooling cannot read them; the chatwoot script does the same.
NAS_OWNER="${PROJECTS_DB_NAS_OWNER:-99:100}"

TS="$(date +%Y%m%d-%H%M)"
DAY="$(date +%Y%m%d)"
DEST="$LOCAL_ROOT/$DAY"

log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
die() { printf 'projects-db-backup: %s\n' "$*" >&2; exit 1; }

require_root() { [[ "$(id -u)" == "0" ]] || die "must run as root on the bas box"; }

in_db() { docker exec -i "$CONTAINER" "$@"; }

# Every database except the template pair and `postgres` itself. `postgres` is the
# maintenance database and holds no project data; if anything is ever created in
# it that is a mistake to fix, not data to carry.
list_databases() {
	in_db psql -U postgres -At \
		-c "select datname from pg_database where datistemplate = false and datname <> 'postgres' order by 1"
}

ssh_nas() { ssh -i "$NAS_KEY" -o BatchMode=yes -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new "$NAS_HOST" "$@"; }

# ---------------------------------------------------------------- the backup
run_backup() {
	require_root
	command -v docker >/dev/null || die "docker is not on PATH"
	docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -qx true \
		|| die "container $CONTAINER is not running; nothing was dumped"

	mkdir -p "$DEST"

	# Read into an array, not a `while read` over a herestring. `docker exec -i`
	# inherits and drains the loop's stdin, so the herestring form dumped the first
	# database and then read EOF and reported success on a partial backup. Measured
	# on the box 2026-10-28: 1 of 4 databases, exit 0, "ok" in the log.
	local -a dbs=()
	local count=0
	mapfile -t dbs < <(list_databases)
	[[ "${#dbs[@]}" -gt 0 ]] || die "no databases to dump; refusing to report success"

	# The globals dump is not decoration. A -Fc dump of one database carries its
	# tables and its `OWNER TO <role>` statements but NOT the role, so restoring
	# into a rebuilt container with no roles fails on the first owner line. This
	# file carries the roles and their scram verifiers, which is also why the whole
	# tree is mode 600 under `umask 077`.
	in_db pg_dumpall -U postgres --globals-only > "$DEST/globals-$TS.sql" < /dev/null
	log "dumped globals -> globals-$TS.sql ($(du -h "$DEST/globals-$TS.sql" | cut -f1))"

	local db
	for db in "${dbs[@]}"; do
		[[ -n "$db" ]] || continue
		# -Fc so pg_restore can pick objects apart on the way back in, and so the
		# dump is compressed without a second tool in the pipe.
		in_db pg_dump -U postgres -Fc "$db" > "$DEST/$db-$TS.dump" < /dev/null
		log "dumped $db -> $db-$TS.dump ($(du -h "$DEST/$db-$TS.dump" | cut -f1))"
		count=$((count + 1))
	done

	# A dump count that does not match the database count is a partial backup, and a
	# partial backup that exits 0 is the failure this whole file exists to prevent.
	[[ "$count" == "${#dbs[@]}" ]] || die "dumped $count of ${#dbs[@]} databases; NOT reporting success"

	# Local prune by day directory, not by file: the files inside a day are all the
	# same age, and deleting files alone leaves a tree of empty directories behind.
	find "$LOCAL_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$LOCAL_KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true

	# One rsync of the day directory, so the NAS mirrors the same YYYYMMDD layout.
	local SSH="ssh -i $NAS_KEY -o BatchMode=yes -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new"
	ssh_nas "mkdir -p '$NAS_DIR'"
	rsync -a --partial -e "$SSH" "$DEST" "$NAS_HOST:$NAS_DIR/"

	# Pruned ON the NAS, deliberately. A prune driven from here stops happening the
	# moment the tunnel or the box dies, which is exactly when the NAS copy is the
	# only copy and is quietly growing without limit. `|| true` because a NAS that
	# refuses the prune has not lost the backup that just landed.
	ssh_nas "find '$NAS_DIR' -mindepth 1 -maxdepth 2 -type f -mtime +$NAS_KEEP_DAYS -delete 2>/dev/null; \
	         find '$NAS_DIR' -mindepth 1 -maxdepth 1 -type d -empty -delete 2>/dev/null; \
	         chown -R $NAS_OWNER '$NAS_DIR'" || true

	logger -t projects-db-backup "ok $TS $count databases + globals -> $NAS_DIR/$DAY"
	log "pushed $count databases + globals to $NAS_HOST:$NAS_DIR/$DAY"
}

# ---------------------------------------------------------------- restore
# Refuses a target that already exists. That is the whole safety story: there is no
# flag here that overwrites a live database, so the production procedure is restore
# beside it and rename, which is also the only version that can be aborted halfway.
restore_dump() {
	require_root
	local file="${1:-}" target="${2:-}"
	[[ -n "$file" && -n "$target" ]] || die "usage: restore <dumpfile> <target-db>"
	[[ -r "$file" ]] || die "cannot read $file"
	[[ "$target" =~ ^[a-z][a-z0-9_]*$ ]] || die "target '$target' must be lowercase [a-z][a-z0-9_]*"

	local exists
	exists="$(in_db psql -U postgres -At -c "select 1 from pg_database where datname = '$target'")"
	[[ -z "$exists" ]] || die "database '$target' already exists; restore beside it and rename, never over it"

	in_db psql -U postgres -q -c "create database \"$target\""
	# --exit-on-error so a half-restored database never reads as a successful one.
	docker exec -i "$CONTAINER" pg_restore -U postgres -d "$target" --no-owner --exit-on-error < "$file"
	log "restored $file -> $target"
}

# ---------------------------------------------------------------- restore proof
# Restores the newest local dump into a scratch database and compares live row
# counts per table against it. This is the assertion the ticket asks for, kept as a
# command so it can be re-run after any change to the dump or restore path rather
# than pasted once into a PR and never repeated.
verify_restore() {
	require_root
	local db="${1:-}"
	if [[ -z "$db" ]]; then db="$(list_databases | head -1)"; fi
	[[ -n "$db" ]] || die "no database to verify"

	local newest
	newest="$(find "$LOCAL_ROOT" -type f -name "$db-*.dump" -print0 2>/dev/null \
		| xargs -0 -r ls -t 2>/dev/null | head -1)"
	[[ -n "$newest" ]] || die "no local dump for $db under $LOCAL_ROOT"

	local scratch="${db}_restorecheck"
	in_db psql -U postgres -q -c "drop database if exists \"$scratch\"" >/dev/null
	log "verify-restore: $db from $newest into $scratch"
	restore_dump "$newest" "$scratch"

	# Per-table exact counts, both sides, same query. A single total would pass with
	# rows moved between tables; a schema-only restore would pass a table-count
	# comparison. This compares the actual numbers table by table.
	local q="select table_schema||'.'||table_name||' '||(xpath('/row/c/text()',
	           query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name),
	           false, true, '')))[1]::text::bigint
	         from information_schema.tables
	         where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog','information_schema')
	         order by 1"
	local src dst
	src="$(in_db psql -U postgres -At -d "$db" -c "$q")"
	dst="$(in_db psql -U postgres -At -d "$scratch" -c "$q")"

	if [[ "$src" == "$dst" ]]; then
		log "verify-restore PASS: $(printf '%s\n' "$src" | grep -c .) tables match exactly"
		printf '%s\n' "$src"
		in_db psql -U postgres -q -c "drop database \"$scratch\"" >/dev/null
		log "verify-restore: dropped $scratch"
	else
		# The scratch database is deliberately left in place on failure: the diff is
		# the evidence, and dropping it destroys the only copy of what went wrong.
		log "verify-restore FAIL: counts differ. $scratch is LEFT IN PLACE for inspection."
		diff <(printf '%s\n' "$src") <(printf '%s\n' "$dst") || true
		return 1
	fi
}

# ---------------------------------------------------------------- install
# The units live here rather than in a separate pair of files so that one scp of
# one script is the whole deploy, the same way bas-projects-db.sh works.
install_units() {
	require_root
	local self=/usr/local/bin/projects-db-backup.sh
	[[ -x "$self" ]] || die "$self is not installed; scp this script there first"

	cat > /etc/systemd/system/projects-db-backup.service <<'UNIT'
[Unit]
Description=Dump every projects-db database and ship it to the library NAS
After=docker.service network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/projects-db-backup.sh
UNIT

	# 02:40 local. The box already runs bas-ship-backup at 00/06/12/18:30 and
	# chatwoot-backup at 04:15; this is 2h10 off the nearest ship-backup slot and
	# 1h35 off chatwoot, so three dump jobs never contend for the same disk and CPU.
	# Persistent=true so a reboot across the window still runs it once.
	cat > /etc/systemd/system/projects-db-backup.timer <<'UNIT'
[Unit]
Description=Nightly projects-db backup

[Timer]
OnCalendar=*-*-* 02:40
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
UNIT

	systemctl daemon-reload
	systemctl enable --now projects-db-backup.timer
	systemctl list-timers --all --no-pager | grep projects-db-backup || true
	log "installed projects-db-backup.timer"
}

case "${1:-}" in
	"") run_backup ;;
	install) install_units ;;
	restore) shift; restore_dump "$@" ;;
	verify-restore) shift; verify_restore "$@" ;;
	*) die "unknown command '$1'; one of: install, restore, verify-restore, or no argument to back up" ;;
esac
