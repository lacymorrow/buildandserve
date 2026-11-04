#!/usr/bin/env bash
# Point-in-time recovery for projects-db: pgBackRest with continuous WAL archiving.
# Runs ON the bas box as root. Installed at /usr/local/bin/projects-db-pitr.sh.
#
#   enable                 build the image, write the config, recreate the container with
#                          archiving on, create the stanza, take the first full backup
#   backup                 full backup now (the nightly timer calls this)
#   info                   pgbackrest info
#   check                  pgbackrest check (proves archive-push works end to end)
#   restore-test [time]    restore into a SCRATCH directory and scratch container, start
#                          it at the target time, print the answer, tear it all down
#   install                write the systemd units and enable the nightly timer
#
# Why this exists next to the nightly dumps: a dump restores to last night. This
# restores to any second inside the retention window, which is the one Neon feature
# that has actually saved us (the keepsake column drop, recovered from Neon's 6-hour
# history). Dumps stay, because a human restores one database from a dump and does not
# restore a whole cluster to fix one app. See docs/ops/projects-db-backups.md.
#
# The repo is /data/backups/pgbackrest, under the tree the library NAS pulls. The box
# holds no credential for the NAS.
set -euo pipefail
umask 077

CONTAINER="${PROJECTS_DB_CONTAINER:-projects-db}"
IMAGE="projects-db-pgbackrest:17"
BASE_IMAGE="postgres:17-alpine"
ROOT="${PROJECTS_DB_ROOT:-/data/projects-db}"
REPO="${PROJECTS_DB_PITR_REPO:-/data/backups/pgbackrest}"
CONF="$ROOT/pgbackrest.conf"
STANZA=projects
KEEP_FULL_DAYS="${PROJECTS_DB_PITR_KEEP_DAYS:-14}"
# 15 minutes bounds the loss on a quiet database. Without it a segment only ships when
# 16 MB of WAL has been written, which on a 67 MB cluster could be days.
ARCHIVE_TIMEOUT="${PROJECTS_DB_ARCHIVE_TIMEOUT:-900}"
PG_UID=70

log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }
die() { printf 'projects-db-pitr: %s\n' "$*" >&2; exit 1; }
require_root() { [[ "$(id -u)" == "0" ]] || die "must run as root on the bas box"; }
pgb() { docker exec -u postgres "$CONTAINER" pgbackrest --stanza="$STANZA" "$@"; }

write_conf() {
	cat > "$CONF" <<EOF
[global]
repo1-path=/var/lib/pgbackrest
# Time-based so "14 days" means 14 days of fulls, not 14 backups.
repo1-retention-full-type=time
repo1-retention-full=$KEEP_FULL_DAYS
compress-type=zst
log-level-console=info
start-fast=y

[$STANZA]
pg1-path=/var/lib/postgresql/data
pg1-socket-path=/var/run/postgresql
EOF
	chmod 644 "$CONF"
}

# The live command line, plus archiving. Kept in step with bas-projects-db.sh; the
# deltas are the image, the two mounts and the archive_* settings. Recreating the
# container is a few seconds of refused connections, and the data directory is a bind
# mount so nothing in it is touched.
recreate() {
	local state
	state="$(docker inspect -f '{{.State.Status}}' "$CONTAINER")"
	log "recreating $CONTAINER with archiving on (was $state)"
	docker stop -t 60 "$CONTAINER" >/dev/null
	docker rename "$CONTAINER" "${CONTAINER}-pre-pitr"
	if ! docker run -d \
		--name "$CONTAINER" \
		--restart unless-stopped \
		-m 1g \
		-p "26432:5432" \
		-v "$ROOT/data:/var/lib/postgresql/data" \
		-v "$ROOT/conf:/pgconf:ro" \
		-v "$CONF:/etc/pgbackrest/pgbackrest.conf:ro" \
		-v "$REPO:/var/lib/pgbackrest" \
		"$IMAGE" \
		postgres \
		-c ssl=on \
		-c ssl_cert_file=/pgconf/server.crt \
		-c ssl_key_file=/pgconf/server.key \
		-c hba_file=/pgconf/pg_hba.conf \
		-c shared_buffers=128MB \
		-c max_connections=100 \
		-c password_encryption=scram-sha-256 \
		-c log_connections=on \
		-c logging_collector=off \
		-c authentication_timeout=10s \
		-c wal_level=replica \
		-c archive_mode=on \
		-c "archive_timeout=$ARCHIVE_TIMEOUT" \
		-c "archive_command=pgbackrest --stanza=$STANZA archive-push %p" >/dev/null; then
		# Put the old container back rather than leave client databases down.
		docker rename "${CONTAINER}-pre-pitr" "$CONTAINER"
		docker start "$CONTAINER" >/dev/null
		die "new container failed to start; the previous one is running again"
	fi
	local i
	for i in $(seq 1 60); do
		docker exec "$CONTAINER" pg_isready -U postgres -q && break
		sleep 1
	done
	docker exec "$CONTAINER" pg_isready -U postgres -q || die "container not ready after 60s"
	log "container is back; the old one is kept as ${CONTAINER}-pre-pitr until you remove it"
}

enable() {
	require_root
	mkdir -p "$REPO"
	chown "$PG_UID:$PG_UID" "$REPO"
	chmod 700 "$REPO"
	log "building $IMAGE from $BASE_IMAGE"
	printf 'FROM %s\nRUN apk add --no-cache pgbackrest\n' "$BASE_IMAGE" | docker build -q -t "$IMAGE" - >/dev/null
	write_conf
	recreate
	pgb stanza-create
	pgb check
	pgb backup --type=full
	log "enabled; first full backup done"
	pgb info
}

backup() {
	require_root
	pgb backup --type=full
	logger -t projects-db-pitr "ok full backup"
	# Anything archived in the last day proves WAL is still flowing, which is what
	# makes the full backup a point-in-time one and not just a snapshot.
	pgb check
}

# Restores into a throwaway directory and starts a throwaway container on it, so
# production is never touched. This is the proof PITR is real: a repo nobody has
# restored from is not a backup.
restore_test() {
	require_root
	local target="${1:-}" scratch name=projects-db-pitr-scratch
	scratch="$(mktemp -d /data/projects-db-pitr-scratch.XXXXXX)"
	chown "$PG_UID:$PG_UID" "$scratch"
	chmod 700 "$scratch"
	docker rm -f "$name" >/dev/null 2>&1 || true
	# EXIT, not RETURN: `set -e` leaving the function on a failed step must still tear
	# the scratch cluster down, or the next run finds a half-restored directory.
	trap 'docker rm -f '"$name"' >/dev/null 2>&1 || true; rm -rf '"$scratch" EXIT

	local -a type_args=(--type=immediate)
	[[ -z "$target" ]] || type_args=(--type=time "--target=$target")
	log "restore-test: ${type_args[*]} into $scratch"
	# --target-action=promote so the scratch cluster comes up writable at the target
	# instead of paused, which is what a real recovery wants too.
	docker run --rm -u postgres --entrypoint pgbackrest \
		-v "$CONF:/etc/pgbackrest/pgbackrest.conf:ro" \
		-v "$REPO:/var/lib/pgbackrest:ro" \
		-v "$scratch:/restore" \
		"$IMAGE" --stanza="$STANZA" --pg1-path=/restore \
		"${type_args[@]}" --target-action=promote restore

	# The restored cluster would try to archive into the real repo. Switch that off
	# in the scratch copy only. The TLS files are not in the data directory, so use
	# plain local connections.
# Same image as production: recovery runs restore_command, which is pgbackrest
	# reading WAL out of the repo, so the scratch cluster needs both mounted.
	# Mounted at /restore, the path the restore wrote into recovery settings.
	docker run -d --name "$name" -e PGDATA=/restore -v "$scratch:/restore" \
		-v "$CONF:/etc/pgbackrest/pgbackrest.conf:ro" \
		-v "$REPO:/var/lib/pgbackrest:ro" "$IMAGE" \
		postgres -c archive_mode=off >/dev/null
	local i
	for i in $(seq 1 60); do
		docker exec "$name" pg_isready -U postgres -q && break
		sleep 1
	done
	docker exec "$name" pg_isready -U postgres -q || { docker logs --tail 30 "$name"; die "scratch cluster did not come up"; }
	log "restore-test: scratch cluster is up. databases and recovery state:"
	docker exec "$name" psql -U postgres -Atc "select datname from pg_database where not datistemplate order by 1"
	docker exec "$name" psql -U postgres -Atc "select 'in_recovery='||pg_is_in_recovery(), now()"
	# PITR_PROBE_DB / PITR_PROBE_SQL: ask the restored cluster a question about the
	# moment you restored to. The cluster is torn down on exit, so this is the only
	# chance, and "it started" is not the same as "it contains the right data".
	if [[ -n "${PITR_PROBE_SQL:-}" ]]; then
		log "restore-test: probe: $PITR_PROBE_SQL"
		docker exec "$name" psql -U postgres -d "${PITR_PROBE_DB:-postgres}" -Atc "$PITR_PROBE_SQL"
	fi
}

install_units() {
	require_root
	cat > /etc/systemd/system/projects-db-pitr.service <<'UNIT'
[Unit]
Description=pgBackRest full backup of projects-db (WAL is archived continuously)
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/projects-db-pitr.sh backup
UNIT
	# 02:50, ten minutes after the dumps at 02:40: same quiet window, never at once.
	cat > /etc/systemd/system/projects-db-pitr.timer <<'UNIT'
[Unit]
Description=Nightly projects-db pgBackRest full backup

[Timer]
OnCalendar=*-*-* 02:50
RandomizedDelaySec=120
Persistent=true

[Install]
WantedBy=timers.target
UNIT
	systemctl daemon-reload
	systemctl enable --now projects-db-pitr.timer
	systemctl list-timers --all --no-pager | grep projects-db-pitr || true
}

case "${1:-}" in
	enable) enable ;;
	backup) backup ;;
	info) pgb info ;;
	check) pgb check ;;
	restore-test) shift; restore_test "$@" ;;
	install) install_units ;;
	*) die "usage: enable | backup | info | check | restore-test [time] | install" ;;
esac
