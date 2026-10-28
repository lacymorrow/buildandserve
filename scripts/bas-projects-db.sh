#!/usr/bin/env bash
# projects-db on the bas box: TLS-only Postgres 17 on projects-db.cloud0.dev:26432
# (128.140.50.130). Clients verify the server cert, so they connect to the name.
#
# Runs ON the bas box as root. Idempotent: every step checks before it acts, so
# re-running it after a partial failure is safe.
#
#   bootstrap                  swap, /data dirs, LE cert, renewal hook, pg_hba, container
#   add-project <name>         one role + one database + one hostssl line, then reload
#   add-preview <name>         the same for <name>_preview, the preview-deploy pair
#   cert-deploy                install the current LE cert and reload postgres
#   cert-check                 expiry, hostname and served-vs-disk drift. Silent when healthy
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
# Overridable so cert-check can be exercised against a scratch directory without
# touching the live cert. Nothing in normal operation sets these.
ROOT=${ROOT:-/data/projects-db}
CONF="$ROOT/conf"
DATA="$ROOT/data"
HBA="$CONF/pg_hba.conf"
DB_HOST=${DB_HOST:-projects-db.cloud0.dev}
LE_LIVE="/etc/letsencrypt/live/$DB_HOST"
DEPLOY_HOOK=/etc/letsencrypt/renewal-hooks/deploy/projects-db.sh
SELF_PATH=/usr/local/sbin/bas-projects-db.sh
# certbot renews at 30 days remaining and its timer runs twice a day, so a cert
# with less than this left has already missed dozens of renewal attempts.
CERT_WARN_DAYS=${CERT_WARN_DAYS:-21}
# uid/gid of the postgres user inside postgres:17-alpine
PG_UID=70
PG_GID=70
# Per-role connection limits, decided on LAC-5969 after one warm Vercel instance
# held all 10 connections of a project role, idle, and nothing else could connect
# at all. A capped app pool is 3 (postgres-js) + 3 (node-postgres) per warm
# instance, so 25 is roughly four warm instances with headroom. Preview deploys
# are many and each one matters less: 5 lets a preview wedge itself without
# reaching production.
#
# Eleven roles at these numbers overcommit max_connections=100 on purpose. A role
# limit is a blast-radius cap, not a reservation; splitting 97 usable slots evenly
# across eleven roles is 7 each, which wedges every app on the box instead of one.
PROD_CONNLIMIT=${PROD_CONNLIMIT:-25}
PREVIEW_CONNLIMIT=${PREVIEW_CONNLIMIT:-5}

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

# Let's Encrypt via certbot, HTTP-01 standalone. Clients connect with
# sslmode=verify-full, one string for every driver; see docs/ops/bas-projects-db.md.
#
# The cert must name $DB_HOST and clients must connect to that name, not to the
# IP. postgres-js sets `servername: net.isIP(socket.host) ? undefined : socket.host`
# (src/connection.js:277), so against a bare IP it sends no SNI and verify-full
# can never pass, whoever issued the cert.
#
# certbot from apt, not snap: apt ships certbot.timer, which is what drives
# renewal here. No renewal cron of our own to drift out of sync.
ensure_certbot() {
	if command -v certbot >/dev/null; then
		log "certbot: $(certbot --version 2>&1)"
	else
		log "certbot: installing from apt"
		DEBIAN_FRONTEND=noninteractive apt-get install -y -q certbot >/dev/null
	fi
	systemctl enable --now certbot.timer >/dev/null 2>&1 || true
	log "certbot: timer is $(systemctl is-enabled certbot.timer 2>/dev/null || echo unknown)"
}

# HTTP-01 needs tcp/80 reachable from the internet at $DB_HOST: one rule on
# Hetzner firewall 11789519. Nothing listens on 80 between renewals, certbot
# binds it for the seconds a challenge takes. DNS-01 was the alternative and was
# rejected: it would put a Cloudflare DNS-edit token on an internet-exposed box,
# a worse trade than an open port with no service behind it.
#
# No account email, on purpose. admin@buildandserve.com is a Cloudflare routing
# address with no mailbox, so LE expiry warnings would go nowhere; `cert-check`
# below is the alarm that actually reaches a person.
ensure_le_cert() {
	if [[ -d "$LE_LIVE" ]]; then
		log "cert: LE lineage present, expires $(openssl x509 -in "$LE_LIVE/cert.pem" -noout -enddate | cut -d= -f2)"
		return
	fi
	log "cert: requesting LE cert for $DB_HOST (HTTP-01 standalone)"
	# Rate limits are per name per week and a failed run burns one, so prove the
	# plumbing against staging before spending a real issuance.
	certbot certonly --standalone --preferred-challenges http \
		-d "$DB_HOST" --agree-tos --register-unsafely-without-email \
		--non-interactive --dry-run
	certbot certonly --standalone --preferred-challenges http \
		-d "$DB_HOST" --agree-tos --register-unsafely-without-email \
		--non-interactive
}

# The hook is a two-line shim onto `cert-deploy` so the logic has one home: this
# script. Editing the script changes renewal behaviour without touching the hook.
ensure_deploy_hook() {
	mkdir -p "$(dirname "$DEPLOY_HOOK")"
	cat >"$DEPLOY_HOOK" <<HOOKEOF
#!/usr/bin/env bash
# Installed by bas-projects-db.sh. Do not edit here; edit the script.
exec $SELF_PATH cert-deploy
HOOKEOF
	chmod 755 "$DEPLOY_HOOK"
	log "hook: $DEPLOY_HOOK installed"
}

disk_fingerprint() {
	openssl x509 -in "$CONF/server.crt" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2
}

# What the server actually serves, read the way a client sees it. Postgres
# negotiates TLS in its own protocol rather than on connect, hence -starttls.
served_pem() {
	openssl s_client -starttls postgres -connect "127.0.0.1:$HOST_PORT" \
		-servername "$DB_HOST" </dev/null 2>/dev/null |
		sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p'
}

served_fingerprint() {
	served_pem | openssl x509 -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2
}

# Runs as the certbot deploy hook and by hand. Copy first, reload second: if the
# reload fails the new files are already in place, so any later reload picks them
# up, and `cert-check` catches the gap meanwhile.
deploy_cert() {
	# certbot runs deploy hooks for every lineage it renews, not just ours.
	if [[ -n "${RENEWED_LINEAGE:-}" && "$RENEWED_LINEAGE" != "$LE_LIVE" ]]; then
		log "cert: hook fired for $RENEWED_LINEAGE, not ours, nothing to do"
		return 0
	fi
	if [[ ! -r "$LE_LIVE/fullchain.pem" ]]; then
		echo "no cert at $LE_LIVE; run bootstrap" >&2
		exit 1
	fi

	# fullchain, not cert: without the intermediate, verify-full fails on any
	# client that does not already happen to have it cached.
	#
	# Write beside the target and rename, so a reload that lands mid-copy never
	# reads a half-written key. install(1) alone truncates in place.
	install -o "$PG_UID" -g "$PG_GID" -m 644 "$LE_LIVE/fullchain.pem" "$CONF/.server.crt.new"
	install -o "$PG_UID" -g "$PG_GID" -m 600 "$LE_LIVE/privkey.pem" "$CONF/.server.key.new"
	mv -f "$CONF/.server.crt.new" "$CONF/server.crt"
	mv -f "$CONF/.server.key.new" "$CONF/server.key"
	log "cert: installed into $CONF, expires $(openssl x509 -in "$CONF/server.crt" -noout -enddate | cut -d= -f2)"

	if [[ "$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null)" != "running" ]]; then
		log "cert: $CONTAINER is not running, skipping reload; it reads the new files on next start"
		return 0
	fi
	docker exec "$CONTAINER" psql -q -U postgres -c "SELECT pg_reload_conf()" >/dev/null
	log "cert: pg_reload_conf() issued"

	# A reload with an unreadable or malformed key keeps the OLD TLS context and
	# only writes a log line, so a zero exit from the reload is not proof. Read
	# the served cert back and compare.
	local served disk
	# A failing openssl pipeline must not abort the script through set -e before
	# the comparison below can report what went wrong.
	served=$(served_fingerprint) || served=""
	disk=$(disk_fingerprint) || disk=""
	if [[ -n "$served" && "$served" == "$disk" ]]; then
		log "cert: server is serving the new cert"
	else
		echo "cert: reload did not take. serving '$served', on disk '$disk'" >&2
		docker logs --tail 20 "$CONTAINER" >&2 || true
		exit 1
	fi
}

# Daily check. A 90-day cert plus sslmode=verify-full turns a silently failed
# renewal into a simultaneous hard outage for every project on this box, so this
# covers the three separate ways it goes wrong:
#   1. the cert is near expiry, so renewal is not running at all
#   2. the server serves a different cert than the one on disk, so a renewal
#      landed but the reload never took. certbot does not retry a hook once the
#      cert itself is fresh, so nothing else catches this
#   3. the served cert does not name $DB_HOST, so verify-full would reject it
# Exit 0 healthy and silent, 1 with the reason on stdout. Silence means healthy.
cert_check() {
	local problems=() served days end
	served=$(served_pem) || served=""

	if [[ -z "$served" ]]; then
		echo "projects-db: no TLS cert served on $DB_HOST:$HOST_PORT (is the container up?)"
		return 1
	fi

	end=$(printf '%s\n' "$served" | openssl x509 -noout -enddate | cut -d= -f2) || end=""
	local end_epoch=""
	[[ -n "$end" ]] && end_epoch=$(date -u -d "$end" +%s 2>/dev/null)
	if [[ -z "$end_epoch" ]]; then
		echo "projects-db: served something that is not a parseable certificate on $DB_HOST:$HOST_PORT"
		return 1
	fi
	days=$(((end_epoch - $(date -u +%s)) / 86400))

	if ((days < CERT_WARN_DAYS)); then
		problems+=("served cert expires in ${days}d ($end); certbot renews at 30d, so renewal has been failing")
	fi
	if ! printf '%s\n' "$served" | openssl x509 -noout -ext subjectAltName 2>/dev/null | grep -q "DNS:$DB_HOST"; then
		problems+=("served cert does not name $DB_HOST; every verify-full client will reject it")
	fi
	local sf df
	sf=$(printf '%s\n' "$served" | openssl x509 -noout -fingerprint -sha256 | cut -d= -f2) || sf=""
	df=$(disk_fingerprint) || df=""
	if [[ -z "$df" ]]; then
		# The running server holds its cert in memory, so it keeps serving and
		# nothing looks wrong until the next restart, which then fails to start.
		problems+=("$CONF/server.crt is missing or unreadable; the container is serving from memory and will not start again. Fix: $SELF_PATH cert-deploy")
	elif [[ "$sf" != "$df" ]]; then
		problems+=("server serves $sf but $CONF/server.crt is $df; a renewal landed without a reload. Fix: $SELF_PATH cert-deploy")
	fi

	if (( ${#problems[@]} == 0 )); then
		return 0
	fi
	printf 'projects-db cert problem on %s:\n' "$DB_HOST"
	printf '  - %s\n' "${problems[@]}"
	return 1
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

# Raise-only, on purpose. Someone lifts a limit by hand when an app is wedged in
# production; a re-run of this script must not quietly put it back and wedge the
# app again. Lowering one is a deliberate act with the command in the runbook,
# after that app's own pool is capped.
set_conn_limit() {
	local proj="$1" want="$2" have
	have=$(psql_super -tAc "select rolconnlimit from pg_roles where rolname='$proj'")
	if [[ "$have" == "$want" ]]; then
		log "$proj: connection limit $have"
	elif [[ "$have" == "-1" ]]; then
		psql_super -q -c "ALTER ROLE \"$proj\" CONNECTION LIMIT $want"
		log "$proj: connection limit unlimited -> $want"
	elif ((have < want)); then
		psql_super -q -c "ALTER ROLE \"$proj\" CONNECTION LIMIT $want"
		log "$proj: connection limit $have -> $want"
	else
		log "$proj: connection limit $have is above the policy $want, left alone"
	fi
}

# One role, one database, never shared. No SUPERUSER, CREATEDB or CREATEROLE.
# The connection limit is the part that matters on a shared box: without it one
# runaway app exhausts max_connections and takes every other project down.
add_project() {
	local proj="$1" connlimit="${2:-$PROD_CONNLIMIT}"
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
		printf "CREATE ROLE %s LOGIN PASSWORD '%s' CONNECTION LIMIT %s;\n" "\"$proj\"" "$pw" "$connlimit" | psql_super -q
		log "$proj: role created"
	fi

	if psql_super -tAc "select 1 from pg_database where datname='$proj'" | grep -qx 1; then
		log "$proj: database exists"
	else
		psql_super -q -c "CREATE DATABASE \"$proj\" OWNER \"$proj\""
		log "$proj: database created"
	fi

	# Postgres grants CONNECT to PUBLIC on every new database, so without this
	# revoke any project's credential can open any other project's database and
	# read its table names. Rows stay private, the schema does not.
	psql_super -q -c "REVOKE CONNECT ON DATABASE \"$proj\" FROM PUBLIC"
	psql_super -q -c "GRANT CONNECT ON DATABASE \"$proj\" TO \"$proj\""
	psql_super -q -c "ALTER ROLE \"$proj\" NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS"
	set_conn_limit "$proj" "$connlimit"

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
	echo "== served cert"
	served_pem | openssl x509 -noout -subject -issuer -enddate -ext subjectAltName 2>/dev/null || echo "none served"
	if cert_check; then echo "cert-check: ok"; fi
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
	ensure_certbot
	ensure_le_cert
	ensure_deploy_hook
	deploy_cert
	ensure_hba
	ensure_container
	# deploy_cert before the container exists only writes the files; reload once
	# it is up so the first boot and a rebuild end in the same place.
	deploy_cert
	;;
add-project)
	add_project "${2:?project name required}" "$PROD_CONNLIMIT"
	;;
add-preview)
	# Every project on this box gets two databases, production and preview, with
	# separate credentials: a preview deploy running a migration must not be able
	# to reach production data.
	preview_proj="${2:?project name required}"
	if [[ "$preview_proj" == *_preview ]]; then
		echo "pass the project name, not the preview name: add-preview ${preview_proj%_preview}" >&2
		exit 1
	fi
	add_project "${preview_proj}_preview" "$PREVIEW_CONNLIMIT"
	;;
cert-deploy)
	deploy_cert
	;;
cert-check)
	cert_check
	;;
verify)
	verify
	;;
*)
	echo "usage: $0 {bootstrap|add-project <name>|add-preview <name>|cert-deploy|cert-check|verify}" >&2
	exit 2
	;;
esac
