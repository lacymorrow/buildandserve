#!/usr/bin/env bash
# projects-db on the bas box (128.140.50.130): TLS-only Postgres 17, port 26432.
#
# Runs ON the bas box as root. Idempotent: every step checks before it acts, so
# re-running it after a partial failure is safe.
#
#   bootstrap                  swap, /data dirs, self-signed cert, pg_hba, container
#   add-project <name>         one role + one database + one hostssl line, then reload
#   verify                     report what is actually running
#
# The superuser password is read from stdin on bootstrap (never an argument, so it
# stays out of argv and shell history). Source of truth for it is zero:
# ~/.paperclip/secrets/projects-db-superuser.env
#
# Why a separate container from the Paperclip Postgres 16 cluster on 127.0.0.1:5432:
# this box runs the BAS client control plane. A runaway project query must not be
# able to starve it.
set -euo pipefail

CONTAINER=projects-db
IMAGE=postgres:17-alpine
HOST_PORT=26432
ROOT=/data/projects-db
CONF="$ROOT/conf"
DATA="$ROOT/data"
HBA="$CONF/pg_hba.conf"
PUBLIC_IP=128.140.50.130
# uid/gid of the postgres user inside postgres:17-alpine
PG_UID=70
PG_GID=70

log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }

require_root() {
	if [[ "$(id -u)" != "0" ]]; then
		echo "must run as root on the bas box" >&2
		exit 1
	fi
}

# 2 GB swapfile. The box ships with none, and the prod box took repeated OOM kills
# before one was added. swappiness=10 keeps it as a safety net, not a first resort.
ensure_swap() {
	if swapon --show=NAME --noheadings | grep -qx /swapfile; then
		log "swap: /swapfile already active"
	else
		if [[ ! -f /swapfile ]]; then
			log "swap: allocating 2G at /swapfile"
			fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
			chmod 600 /swapfile
			mkswap /swapfile >/dev/null
		fi
		swapon /swapfile
		log "swap: enabled"
	fi

	if grep -qE '^\s*/swapfile\s' /etc/fstab; then
		log "swap: fstab entry present"
	else
		printf '/swapfile none swap sw 0 0\n' >>/etc/fstab
		log "swap: fstab entry added"
	fi

	printf 'vm.swappiness=10\n' >/etc/sysctl.d/99-swappiness.conf
	sysctl -q -p /etc/sysctl.d/99-swappiness.conf
	log "swap: vm.swappiness=$(cat /proc/sys/vm/swappiness)"
}

ensure_dirs() {
	mkdir -p "$DATA" "$CONF"
	log "dirs: $DATA and $CONF exist"
}

# Self-signed, 10 years. Clients connect with sslmode=require, which encrypts but
# does not verify the chain; see docs/ops/bas-projects-db.md for the per-driver
# table, because node-postgres and prisma each need a different spelling of that.
ensure_cert() {
	if [[ -f "$CONF/server.crt" && -f "$CONF/server.key" ]]; then
		log "cert: already present, expires $(openssl x509 -in "$CONF/server.crt" -noout -enddate | cut -d= -f2)"
	else
		log "cert: generating self-signed cert for $PUBLIC_IP"
		openssl req -new -x509 -days 3650 -nodes \
			-out "$CONF/server.crt" -keyout "$CONF/server.key" \
			-subj "/CN=projects-db.bas" \
			-addext "subjectAltName=IP:$PUBLIC_IP,DNS:projects-db.bas" 2>/dev/null
	fi
	chmod 600 "$CONF/server.key"
	chmod 644 "$CONF/server.crt"
	chown "$PG_UID:$PG_GID" "$CONF/server.crt" "$CONF/server.key"
}

# Deliberately tighter than the umami-db copy this container is modelled on.
# umami-db ships `hostssl all all all scram-sha-256`; on a multi-tenant box that
# means a leaked keepsake password reaches the shipkit database. One hostssl line
# per project instead, appended by add-project.
#
# Nothing here matches a non-SSL connection from off-box, so plaintext is rejected
# at the hba layer rather than merely discouraged. That is the TLS-only guarantee.
ensure_hba() {
	if [[ -f "$HBA" ]]; then
		log "hba: already present, $(grep -c '^hostssl' "$HBA") project line(s)"
	else
		cat >"$HBA" <<'HBAEOF'
# projects-db. TLS-only from off-box: there is no `host` line for a non-loopback
# address, so a plaintext connection has no matching rule and is refused.
# One hostssl line per project; never `hostssl all all all`.
local   all                  all                  trust
host    all                  all                  127.0.0.1/32 trust
host    all                  all                  ::1/128      trust
HBAEOF
		log "hba: written"
	fi
	chmod 644 "$HBA"
	chown "$PG_UID:$PG_GID" "$HBA"
}

wait_ready() {
	for _ in $(seq 1 60); do
		if docker exec "$CONTAINER" pg_isready -q -U postgres 2>/dev/null; then
			log "container: ready"
			return 0
		fi
		sleep 1
	done
	echo "container did not become ready; docker logs $CONTAINER" >&2
	exit 1
}

ensure_container() {
	if docker inspect "$CONTAINER" >/dev/null 2>&1; then
		local state
		state=$(docker inspect -f '{{.State.Status}}' "$CONTAINER")
		if [[ "$state" == "running" ]]; then
			log "container: $CONTAINER already running"
			wait_ready
		else
			# Never silently leave a stopped container stopped: that is the one
			# state where a no-op bootstrap looks like success and the DB is down.
			log "container: $CONTAINER is $state, starting it"
			docker start "$CONTAINER" >/dev/null
			wait_ready
		fi
		return
	fi

	local pw
	log "container: reading superuser password from stdin"
	IFS= read -r pw
	if [[ -z "$pw" ]]; then
		echo "empty superuser password on stdin" >&2
		exit 1
	fi

	log "container: starting $CONTAINER on :$HOST_PORT"
	POSTGRES_PASSWORD="$pw" docker run -d \
		--name "$CONTAINER" \
		--restart unless-stopped \
		-m 1g \
		-p "$HOST_PORT:5432" \
		-v "$DATA:/var/lib/postgresql/data" \
		-v "$CONF:/pgconf:ro" \
		-e POSTGRES_PASSWORD \
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
		-c logging_collector=off >/dev/null

	wait_ready
}

psql_super() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres "$@"; }

# One role, one database, never shared. No SUPERUSER, CREATEDB or CREATEROLE.
# CONNECTION LIMIT 10 is the part that matters on a shared box: without it one
# runaway app exhausts max_connections and takes every other project down.
add_project() {
	local proj="$1"
	if [[ ! "$proj" =~ ^[a-z][a-z0-9_]{1,30}$ ]]; then
		echo "project name must be lowercase [a-z][a-z0-9_]: got '$proj'" >&2
		exit 1
	fi

	local pw
	log "$proj: reading role password from stdin"
	IFS= read -r pw
	if [[ ${#pw} -lt 32 ]]; then
		echo "role password must be at least 32 chars" >&2
		exit 1
	fi
	# Keeps the password out of SQL-quoting territory entirely, and out of a
	# DATABASE_URL that would otherwise need percent-encoding.
	if [[ ! "$pw" =~ ^[A-Za-z0-9_-]+$ ]]; then
		echo "role password must be [A-Za-z0-9_-] only" >&2
		exit 1
	fi

	if psql_super -tAc "select 1 from pg_roles where rolname='$proj'" | grep -qx 1; then
		log "$proj: role exists, leaving its password alone"
	else
		# Password travels on stdin, not argv, so it never lands in ps output.
		printf "CREATE ROLE %s LOGIN PASSWORD '%s' CONNECTION LIMIT 10;\n" "\"$proj\"" "$pw" | psql_super -q
		log "$proj: role created"
	fi

	if psql_super -tAc "select 1 from pg_database where datname='$proj'" | grep -qx 1; then
		log "$proj: database exists"
	else
		psql_super -q -c "CREATE DATABASE \"$proj\" OWNER \"$proj\""
		log "$proj: database created"
	fi

	psql_super -q -c "REVOKE CONNECT ON DATABASE \"$proj\" FROM PUBLIC"
	psql_super -q -c "ALTER ROLE \"$proj\" CONNECTION LIMIT 10"
	psql_super -q -c "ALTER ROLE \"$proj\" NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"

	if grep -qE "^hostssl[[:space:]]+${proj}[[:space:]]+${proj}[[:space:]]" "$HBA"; then
		log "$proj: hba line present"
	else
		# Padded to the same columns as the base lines; this file gets read by a
		# human far more often than it gets written.
		printf 'hostssl %-20s %-20s %-12s %s\n' "$proj" "$proj" all scram-sha-256 >>"$HBA"
		chown "$PG_UID:$PG_GID" "$HBA"
		log "$proj: hba line appended"
	fi
	psql_super -q -c "SELECT pg_reload_conf()" >/dev/null
	log "$proj: hba reloaded"
}

verify() {
	echo "== swap"
	swapon --show || true
	echo "vm.swappiness=$(cat /proc/sys/vm/swappiness)"
	echo
	echo "== conf perms"
	ls -la "$CONF"
	echo
	echo "== container"
	docker ps --filter "name=$CONTAINER" --format '{{.Names}}  {{.Image}}  {{.Status}}  {{.Ports}}'
	echo
	echo "== pg_hba.conf"
	cat "$HBA"
	echo
	echo "== roles"
	psql_super -c "\du"
	echo "== databases"
	psql_super -c "\l"
}

require_root
case "${1:-}" in
bootstrap)
	ensure_swap
	ensure_dirs
	ensure_cert
	ensure_hba
	ensure_container
	;;
add-project)
	add_project "${2:?project name required}"
	;;
verify)
	verify
	;;
*)
	echo "usage: $0 {bootstrap|add-project <name>|verify}" >&2
	exit 2
	;;
esac
