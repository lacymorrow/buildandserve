#!/usr/bin/env bash
# PgBouncer in front of projects-db on the bas box (LAC-6076). Transaction
# pooling on projects-db.cloud0.dev:26433, so the number of *server* connections
# stops depending on how many instances Vercel happens to warm.
#
# Runs ON the bas box as root. Idempotent: every step checks before it acts, so
# re-running it after a partial failure is safe.
#
#   bootstrap                network, dirs, config, container
#   add-project <role>       pool entry + userlist entry + pooler hba line (password on stdin)
#   add-monitor              the same three for fleet-health's monitor role (password on stdin)
#   drop-monitor             take the monitor off the pooler; the direct port is untouched
#   drop-project <role>      remove all three. The rollback lever
#   pools                    SHOW POOLS / SHOW SERVERS / SHOW CLIENTS over the unix socket
#   console <sql>            any admin console command, same path
#   reload                   RELOAD the pooler after a config edit
#   verify                   report what is actually running
#
# Why this exists, measured: within a minute of the first cutover (LAC-5984) the
# gracefully_imagined role sat at 10 of 10 connections, all idle, and nothing
# else could connect, psql over the tailnet included. Payload builds a
# node-postgres pool with no `max` so it takes the default of 10, and a frozen
# Vercel instance cannot run its own idle timer, so it never gives them back.
# Neon's pooler had been absorbing this for all five repos; removing Neon removed
# the pooler. An app-side `max: 3` lowers the per-instance number but cannot
# bound the instance count, so the only bound that holds is on the server side.
#
# ---------------------------------------------------------------------------
# READ THIS BEFORE CHANGING ANY TLS OR AUTH SETTING BELOW.
#
# PgBouncer terminates TLS. Postgres therefore never sees the app's client
# certificate, so the `clientcert=verify-full` access control LAC-6060 built does
# not reach through the pooler on its own. Two settings replace it and BOTH are
# required; either one alone is a silent downgrade that leaves everything working:
#
#   client_tls_sslmode = verify-full   proves the cert chains to the private CA
#   auth_type = hba + method `cert`    binds the cert's CN to the Postgres role
#
# The first without the second accepts ANY certificate our CA ever issued for
# ANY role: PgBouncer's `verify-full` is documented as "Same as verify-ca" and
# checks the chain only, never the CN. The second without the first accepts any
# self-signed certificate claiming any CN, because at `require` and below
# "if the client presents a client certificate, it is not validated".
#
# What is deliberately given up, and it is not nothing: the pooled path is
# cert-only, single-factor. PgBouncer has no equivalent of Postgres's
# `scram-sha-256 clientcert=verify-full`, which demands a certificate AND a
# password; `clientcert=` is not a PgBouncer setting and its HBA parser rejects
# it outright ("unsupported parameters", src/hba.c). With client auth set to
# `cert` the client sends no password at all, and a stored SCRAM secret cannot be
# replayed to the server either, because pass-through needs the *client* auth to
# be SCRAM. So the pooler must hold each role's plaintext password to open the
# server connection, which is the userlist file below.
#
# The threat LAC-6060 was actually built for still fails closed. That one is
# LAC-6032: a leaked *password* still authenticating weeks later. A password
# alone opens nothing here either, because the pooled port demands a certificate
# and the direct port still demands both. What is genuinely weaker is a leaked
# certificate *and key* with no password, which used to be refused and is now
# accepted. In practice both halves live in the same Vercel environment and leak
# together, so this buys an attacker little; it is still a real reduction and it
# is why LAC-6077 owns the merge.
# ---------------------------------------------------------------------------
#
# Runbook: docs/ops/bas-projects-db.md
set -euo pipefail

CONTAINER=projects-db-pooler
# Pinned by digest, not by tag. This container terminates TLS and is the only
# thing enforcing the CN-to-role binding above, so "whatever :latest is today"
# is not an acceptable description of it. PgBouncer 1.26.1, OpenSSL 3.5.8.
IMAGE=${IMAGE:-edoburu/pgbouncer@sha256:8638aa563607256d3c7440437534195f1066a92b68015d89ae9d6b935b444a6d}
# The pooled port. The direct port 26432 is untouched and stays the one for
# migrations and ops; see "what breaks in transaction mode" in the runbook.
HOST_PORT=${HOST_PORT:-26433}
NETWORK=projects-db-pool
# Fixed so the pooler can reach Postgres by its certificate's name over a private
# bridge instead of hairpinning out to the public IP. Docker's embedded DNS
# resolves the dotted alias on this network, which is what lets the server side
# stay at verify-full rather than dropping to verify-ca.
NETWORK_SUBNET=${NETWORK_SUBNET:-172.31.0.0/24}
PG_CONTAINER=projects-db
PG_IP=${PG_IP:-172.31.0.2}
DB_HOST=${DB_HOST:-projects-db.cloud0.dev}

ROOT=${ROOT:-/data/pgbouncer}
CONF="$ROOT/conf"
SECRET="$ROOT/secret"
RUN="$ROOT/run"
INI="$CONF/pgbouncer.ini"
HBA="$CONF/pgb_hba.conf"
USERLIST="$SECRET/userlist.txt"

# The Postgres container's config directory, mounted read-only into the pooler
# too. Shared rather than copied on purpose: server.crt and server.key are the
# Let's Encrypt pair that certbot's deploy hook already rewrites, and
# clients-ca.crt is the LAC-6060 private CA. A second copy would be a second
# thing to forget on renewal.
PG_CONF=${PG_CONF:-/data/projects-db/conf}
# Read, never written, by this script: `add-monitor` takes the monitor's database
# out of the Postgres hba rather than being told it, so the two scripts cannot
# disagree about which database fleet-health's role is allowed to reach.
PG_HBA=${PG_HBA:-$PG_CONF/pg_hba.conf}
SELF_PATH=/usr/local/sbin/bas-pgbouncer.sh

# fleet-health's no-data role (LAC-5980). It is not a project: it reads ONE
# project database, is not named after it, and holds USAGE on no schema.
MONITOR_ROLE=${MONITOR_ROLE:-fleet_monitor}
# One server connection, no reserve. The probe opens one connection per tick and
# the role's CONNECTION LIMIT is 3, so a pool of 1 can neither queue behind
# itself nor take a slot a project pool was counting on. A watcher that can
# contribute to the saturation it is measuring is not a watcher.
MONITOR_POOL=${MONITOR_POOL:-1}

# Pool sizes. The production pair sums to 15, under the role's CONNECTION LIMIT
# of 25; the preview pair sums to 5, which is exactly the preview role's limit.
# That ceiling is the trap worth naming: a pool larger than the role's limit does
# not fail at configuration time, it fails later as the pooler trying to open a
# server connection the role is not allowed to have.
PROD_POOL=${PROD_POOL:-10}
PROD_RESERVE=${PROD_RESERVE:-5}
PREVIEW_POOL=${PREVIEW_POOL:-3}
PREVIEW_RESERVE=${PREVIEW_RESERVE:-2}
# Client-side connections are cheap: a few kB of pooler memory each, no server
# connection, no Postgres slot. Generous on purpose, because the whole point is
# that a client connection is no longer the scarce thing.
MAX_CLIENT_CONN=${MAX_CLIENT_CONN:-1000}
# uid/gid of the pgbouncer user inside the image. Same 70 as postgres:17-alpine,
# which is why the shared $PG_CONF mount works for both containers.
PGB_UID=70
PGB_GID=70

log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*"; }

require_root() {
	if [[ "$(id -u)" != "0" ]]; then
		echo "must run as root on the bas box" >&2
		exit 1
	fi
}

valid_role() {
	if [[ ! "$1" =~ ^[a-z][a-z0-9_]{1,40}$ ]]; then
		echo "role must be lowercase [a-z][a-z0-9_]: got '$1'" >&2
		exit 1
	fi
}

ensure_dirs() {
	mkdir -p "$CONF" "$SECRET" "$RUN"
	# $CONF is world-readable: it holds no secret, and being able to read the
	# running config without root is useful. $SECRET is not, because it holds
	# every role's plaintext password.
	chmod 755 "$ROOT" "$CONF"
	chmod 700 "$SECRET" "$RUN"
	chown "$PGB_UID:$PGB_GID" "$SECRET" "$RUN"
	log "dirs: $ROOT"
}

ensure_network() {
	if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
		docker network create --subnet "$NETWORK_SUBNET" "$NETWORK"
		log "network: $NETWORK created on $NETWORK_SUBNET"
	else
		log "network: $NETWORK already present"
	fi

	if docker inspect "$PG_CONTAINER" --format '{{json .NetworkSettings.Networks}}' | grep -q "$NETWORK"; then
		log "network: $PG_CONTAINER already attached"
	else
		# The dotted alias is the load-bearing part: it is what lets the pooler
		# connect to the name on the Let's Encrypt certificate over a private
		# bridge, so server_tls_sslmode can stay at verify-full.
		docker network connect --ip "$PG_IP" --alias "$PG_CONTAINER" --alias "$DB_HOST" \
			"$NETWORK" "$PG_CONTAINER"
		log "network: $PG_CONTAINER attached at $PG_IP as $DB_HOST"
	fi
}

# The pooler's own hba. `auth_type = hba` means the method is chosen per line
# here rather than once globally, which is what makes a one-project-at-a-time
# rollout possible: a project with no line cannot reach the pooler at all.
#
# The admin console is a `local` line on the unix socket, reachable only by root
# on the box through the 0700 $RUN directory. `trust` there grants nothing new:
# root on this box already has `docker exec projects-db psql -U postgres` through
# the `local all all trust` line in the Postgres hba. Keeping the console off TCP
# entirely is what avoids storing a pgbadmin certificate and key on the box.
ensure_hba() {
	if [[ -f "$HBA" ]]; then
		log "hba: already present, $(grep -c '^hostssl' "$HBA" || true) project line(s)"
	else
		cat >"$HBA" <<'HBAEOF'
# PgBouncer hba (auth_type = hba). One hostssl line per project, method `cert`.
#
# `cert` is what binds the certificate's CN to the Postgres role. PgBouncer's
# client_tls_sslmode=verify-full proves the chain and NOTHING ELSE -- it is
# documented as "Same as verify-ca" and never looks at the CN -- so without a
# `cert` line here any certificate this CA ever issued opens any role.
#
# There is no tailnet line and no password line. Ops does not come through the
# pooler; it uses the direct port 26432, where the Postgres hba still demands a
# password and, for a flipped project, a certificate as well.
local   pgbouncer  pgbadmin  trust
HBAEOF
		log "hba: written"
	fi
	chmod 644 "$HBA"
}

ensure_userlist() {
	if [[ ! -f "$USERLIST" ]]; then
		# pgbadmin has an empty secret on purpose: its hba line is `trust` on a
		# unix socket in a 0700 directory, so there is nothing for a password to
		# add. PgBouncer still requires the name to exist in this file.
		printf '"pgbadmin" ""\n' >"$USERLIST"
		log "userlist: written"
	fi
	chmod 600 "$USERLIST"
	chown "$PGB_UID:$PGB_GID" "$USERLIST"
}

# Rewritten whole every time rather than edited in place, so it lands in the same
# state from any starting point including a half-applied one. The [databases]
# section is generated from the pool entries recorded in $CONF/databases.d.
ensure_ini() {
	mkdir -p "$CONF/databases.d"
	chmod 755 "$CONF/databases.d"
	local tmp="$INI.new"
	{
		echo "# Generated by $SELF_PATH. Do not edit by hand; edit the script."
		echo "[databases]"
		cat "$CONF"/databases.d/*.conf 2>/dev/null || true
		cat <<INIEOF

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
unix_socket_dir = $RUN
unix_socket_mode = 0700

# Transaction pooling is the whole point: a server connection goes back to the
# pool when the transaction ends, so a frozen Vercel instance holding a client
# connection is no longer holding a Postgres slot. What it costs is session
# state. See "what breaks in transaction mode" in the runbook before pointing
# anything at this port.
pool_mode = transaction
max_client_conn = $MAX_CLIENT_CONN

# Per-database pool_size and reserve_pool are set on each [databases] line
# instead of here, because the preview roles have a CONNECTION LIMIT of 5 and a
# global default of 10 would overrun it.
default_pool_size = $PROD_POOL
reserve_pool_size = $PROD_RESERVE
reserve_pool_timeout = 3

# Hand a server connection back reasonably fast. This is the idle timer the
# frozen Vercel instance could not run for itself.
server_idle_timeout = 60
server_lifetime = 3600

auth_type = hba
auth_hba_file = $HBA
auth_file = $USERLIST
admin_users = pgbadmin
stats_users = pgbadmin

# Client side: prove the chain against the LAC-6060 private CA, and present the
# Let's Encrypt pair so the app's own verify-full still passes. Both files come
# from the shared $PG_CONF mount, so certbot's existing deploy hook keeps them
# current for the pooler as well as for Postgres.
client_tls_sslmode = verify-full
client_tls_ca_file = /pgconf/clients-ca.crt
client_tls_cert_file = /pgconf/server.crt
client_tls_key_file = /pgconf/server.key

# Server side: full verification, hostname included, over the private bridge.
# Possible only because the Docker network alias makes the certificate's own
# name resolve to the container, so this is not merely encryption to an
# unverified peer one hop away.
server_tls_sslmode = verify-full
server_tls_ca_file = /etc/ssl/certs/ca-certificates.crt

# Only extra_float_digits. Deliberately NOT search_path: under transaction
# pooling a silently dropped search_path means queries landing in the wrong
# schema on a connection that looks healthy. Failing loudly with "unsupported
# startup parameter" is the better outcome, so add to this list one parameter at
# a time and only after deciding what it does when a connection is reused.
ignore_startup_parameters = extra_float_digits

log_connections = 1
log_disconnections = 0
INIEOF
	} >"$tmp"
	chmod 644 "$tmp"
	mv -f "$tmp" "$INI"
	log "ini: written, $(grep -c '^[a-z_]* = ' "$INI" || true) setting(s)"
}

ensure_container() {
	local want running
	want=$(docker image inspect "$IMAGE" --format '{{.Id}}' 2>/dev/null || true)
	if [[ -z "$want" ]]; then
		docker pull "$IMAGE" >/dev/null
		want=$(docker image inspect "$IMAGE" --format '{{.Id}}')
	fi

	if docker inspect "$CONTAINER" >/dev/null 2>&1; then
		running=$(docker inspect "$CONTAINER" --format '{{.Image}}')
		if [[ "$running" == "$want" ]]; then
			docker start "$CONTAINER" >/dev/null 2>&1 || true
			log "container: already on the pinned image"
			return 0
		fi
		log "container: image changed, recreating"
		docker rm -f "$CONTAINER" >/dev/null
	fi

	# --entrypoint bypasses the image's entrypoint.sh, which generates a config
	# from environment variables. The config here is written by this script and
	# mounted read-only; nothing should be able to rewrite it at boot.
	docker run -d \
		--name "$CONTAINER" \
		--restart unless-stopped \
		--network "$NETWORK" \
		--memory 256m \
		-p "0.0.0.0:$HOST_PORT:6432" \
		-v "$PG_CONF:/pgconf:ro" \
		-v "$CONF:$CONF:ro" \
		-v "$SECRET:$SECRET:ro" \
		-v "$RUN:$RUN" \
		--entrypoint /usr/bin/pgbouncer \
		"$IMAGE" "$INI" >/dev/null
	log "container: started on $HOST_PORT"
}

wait_ready() {
	local _attempt
	for _attempt in $(seq 1 30); do
		if console "SHOW VERSION" >/dev/null 2>&1; then
			log "pooler: ready"
			return 0
		fi
		sleep 1
	done
	echo "pooler: not answering the admin console after 30s" >&2
	docker logs --tail 40 "$CONTAINER" >&2 || true
	return 1
}

# The admin console, over the unix socket. A throwaway psql because the pooler
# image has no client; it joins the pool network and the 0700 socket directory,
# both of which already require root on this box.
console() {
	docker run --rm -i \
		--network "$NETWORK" \
		-v "$RUN:$RUN" \
		-e PGCONNECT_TIMEOUT=5 \
		postgres:17-alpine \
		psql -h "$RUN" -p 6432 -U pgbadmin pgbouncer -c "$1"
}

reload() {
	console "RELOAD" >/dev/null
	log "pooler: reloaded"
}

pools() {
	console "SHOW POOLS"
	console "SHOW SERVERS"
	console "SHOW CLIENTS"
	console "SHOW DATABASES"
}

# One project through the pooler. Three things land together and all three are
# required, which is why this is one subcommand and not three:
#
#   1. a [databases] entry, so the pooler knows where to send it
#   2. a userlist entry, so the pooler can open the server connection
#   3. an hba `cert` line, so only that role's certificate can ask it to
#
# The password is read from stdin, never an argument, so it stays out of argv and
# shell history. Source of truth stays zero's ~/.paperclip/secrets/<project>-db.env.
add_project() {
	local role="$1" password pool reserve
	valid_role "$role"

	password=$(cat)
	password=${password%$'\n'}
	if [[ -z "$password" ]]; then
		echo "no password on stdin" >&2
		exit 1
	fi
	case "$password" in
	*'"'* | *'\'*)
		# The userlist format is quoted strings with backslash escapes. Rather
		# than get the escaping subtly wrong in a file that controls database
		# access, refuse and let the password be regenerated.
		echo "password contains a quote or backslash; regenerate it with openssl rand -hex 24" >&2
		exit 1
		;;
	esac

	if [[ "$role" == *_preview ]]; then
		pool=$PREVIEW_POOL
		reserve=$PREVIEW_RESERVE
	else
		pool=$PROD_POOL
		reserve=$PROD_RESERVE
	fi

	# Refuse rather than overrun the role's CONNECTION LIMIT. A pool bigger than
	# the limit does not fail here, it fails later as the pooler trying to open a
	# connection the role is not allowed to have, which reads as a capacity
	# problem and is a configuration one.
	local limit
	limit=$(docker exec -i "$PG_CONTAINER" psql -tAU postgres \
		-c "select rolconnlimit from pg_roles where rolname = '$role'" 2>/dev/null || true)
	if [[ -z "$limit" ]]; then
		echo "role $role does not exist on $PG_CONTAINER" >&2
		exit 1
	fi
	if [[ "$limit" != "-1" ]] && ((pool + reserve > limit)); then
		echo "pool_size $pool + reserve $reserve exceeds $role CONNECTION LIMIT $limit" >&2
		exit 1
	fi

	mkdir -p "$CONF/databases.d"
	printf '%s = host=%s port=5432 dbname=%s pool_size=%s reserve_pool=%s\n' \
		"$role" "$DB_HOST" "$role" "$pool" "$reserve" >"$CONF/databases.d/$role.conf"
	chmod 644 "$CONF/databases.d/$role.conf"

	grep -v "^\"$role\" " "$USERLIST" >"$USERLIST.new" || true
	printf '"%s" "%s"\n' "$role" "$password" >>"$USERLIST.new"
	chmod 600 "$USERLIST.new"
	chown "$PGB_UID:$PGB_GID" "$USERLIST.new"
	mv -f "$USERLIST.new" "$USERLIST"

	if ! grep -qE "^hostssl[[:space:]]+${role}[[:space:]]+${role}[[:space:]]" "$HBA"; then
		printf 'hostssl %-30s %-30s %-6s %s\n' "$role" "$role" "all" "cert" >>"$HBA"
	fi

	ensure_ini
	reload
	log "$role: pooled, pool_size=$pool reserve=$reserve, limit $limit"
	log "$role: DATABASE_URL host port becomes $HOST_PORT, and the app needs prepare: false"
}

# fleet-health's monitor through the pooler (LAC-6132). Same three things as
# add_project, with two differences that matter.
#
# The pool is an ALIAS. A project's pool is named after its role because the two
# names are the same; the monitor's are not, so the pool is named for the ROLE and
# its `dbname=` points at the project database the role may read. PgBouncer
# matches its hba on the database the client ASKED for, which is the alias, so the
# cert line below is about `fleet_monitor` and nothing else can use it. Pools are
# keyed per (database, user), so the monitor's one connection is its own pool and
# never draws on the project's.
#
# And the Postgres half is a separate, deliberate step, for the same reason
# `require-client-cert` is: this subcommand grants nothing on the server. Without
# `bas-projects-db.sh allow-monitor-pooler` the pooler authenticates the
# certificate here and is then refused one hop later.
add_monitor() {
	local role="$MONITOR_ROLE" password db limit
	valid_role "$role"

	password=$(cat)
	password=${password%$'\n'}
	if [[ -z "$password" ]]; then
		echo "no password on stdin" >&2
		exit 1
	fi
	case "$password" in
	*'"'* | *'\\'*)
		echo "password contains a quote or backslash; regenerate it with openssl rand -hex 24" >&2
		exit 1
		;;
	esac

	# The database comes from the role's own hba lines, not from an argument. The
	# monitor is provisioned by hand, so a name typed here twice is a name that
	# can be typed differently twice.
	db=$(awk -v r="$role" '$1 == "hostssl" && $3 == r { print $2; exit }' "$PG_HBA" 2>/dev/null || true)
	if [[ -z "$db" ]]; then
		echo "$role has no hostssl line in $PG_HBA, so which database it may read is unknown" >&2
		echo "the monitor role is provisioned by hand (LAC-5980); add its direct lines first" >&2
		exit 1
	fi

	limit=$(docker exec -i "$PG_CONTAINER" psql -tAU postgres \
		-c "select rolconnlimit from pg_roles where rolname = '$role'" 2>/dev/null || true)
	if [[ -z "$limit" ]]; then
		echo "role $role does not exist on $PG_CONTAINER" >&2
		exit 1
	fi
	if [[ "$limit" != "-1" ]] && ((MONITOR_POOL > limit)); then
		echo "pool_size $MONITOR_POOL exceeds $role CONNECTION LIMIT $limit" >&2
		exit 1
	fi

	mkdir -p "$CONF/databases.d"
	printf '%s = host=%s port=5432 dbname=%s pool_size=%s reserve_pool=0\n' \
		"$role" "$DB_HOST" "$db" "$MONITOR_POOL" >"$CONF/databases.d/$role.conf"
	chmod 644 "$CONF/databases.d/$role.conf"

	grep -v "^\"$role\" " "$USERLIST" >"$USERLIST.new" || true
	printf '"%s" "%s"\n' "$role" "$password" >>"$USERLIST.new"
	chmod 600 "$USERLIST.new"
	chown "$PGB_UID:$PGB_GID" "$USERLIST.new"
	mv -f "$USERLIST.new" "$USERLIST"

	if ! grep -qE "^hostssl[[:space:]]+${role}[[:space:]]+${role}[[:space:]]" "$HBA"; then
		printf 'hostssl %-30s %-30s %-6s %s\n' "$role" "$role" "all" "cert" >>"$HBA"
	fi

	ensure_ini
	reload
	log "$role: pooled as alias '$role' -> dbname=$db, pool_size=$MONITOR_POOL, limit $limit"
	log "$role: now run on this box: /usr/local/sbin/bas-projects-db.sh allow-monitor-pooler"
	log "$role: then add PROJECTS_DB_MONITOR_POOLED_URL to zero's projects-db-monitor.env"
}

drop_monitor() {
	local role="$MONITOR_ROLE"
	valid_role "$role"
	rm -f "$CONF/databases.d/$role.conf"
	grep -v "^\"$role\" " "$USERLIST" >"$USERLIST.new" || true
	chmod 600 "$USERLIST.new"
	chown "$PGB_UID:$PGB_GID" "$USERLIST.new"
	mv -f "$USERLIST.new" "$USERLIST"
	grep -vE "^hostssl[[:space:]]+${role}[[:space:]]+${role}[[:space:]]" "$HBA" >"$HBA.new" || true
	chmod 644 "$HBA.new"
	mv -f "$HBA.new" "$HBA"
	ensure_ini
	reload
	log "$role: removed from the pooler. Drop the server grant too with:"
	log "$role:   /usr/local/sbin/bas-projects-db.sh deny-monitor-pooler"
}

# The rollback lever. Removes the project from the pooler and leaves the direct
# port exactly as it was, so an app put back on port 26432 is working again as
# soon as it redeploys.
drop_project() {
	local role="$1"
	valid_role "$role"
	rm -f "$CONF/databases.d/$role.conf"
	grep -v "^\"$role\" " "$USERLIST" >"$USERLIST.new" || true
	chmod 600 "$USERLIST.new"
	chown "$PGB_UID:$PGB_GID" "$USERLIST.new"
	mv -f "$USERLIST.new" "$USERLIST"
	grep -vE "^hostssl[[:space:]]+${role}[[:space:]]+${role}[[:space:]]" "$HBA" >"$HBA.new" || true
	chmod 644 "$HBA.new"
	mv -f "$HBA.new" "$HBA"
	ensure_ini
	reload
	log "$role: removed from the pooler; port 26432 is unchanged"
}

verify() {
	echo "== container"
	docker ps --filter "name=^${CONTAINER}$" --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
	echo
	echo "== image digest"
	docker inspect "$CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || true
	echo
	echo "== pooled databases"
	cat "$CONF"/databases.d/*.conf 2>/dev/null || echo "(none)"
	echo
	echo "== pooler hba"
	grep -vE '^\s*#|^\s*$' "$HBA" || true
	echo
	echo "== userlist (names only)"
	cut -d' ' -f1 "$USERLIST" 2>/dev/null || true
	echo
	echo "== secret file modes"
	# Numeric uid:gid, because 70 is the pgbouncer user *inside the image* and has
	# no passwd entry on the host, so the name form prints UNKNOWN and reads like
	# a fault. Expect 600 70:70 on the userlist and 700 70:70 on its directory.
	stat -c '%a %u:%g %n' "$SECRET" "$USERLIST" 2>/dev/null || true
	echo
	echo "== TLS settings in force"
	console "SHOW CONFIG" 2>/dev/null | grep -E 'client_tls|server_tls|auth_type|auth_hba|pool_mode' || true
	echo
	echo "== pools"
	console "SHOW POOLS" 2>/dev/null || true
	echo
	echo "== postgres connections right now"
	docker exec -i "$PG_CONTAINER" psql -U postgres \
		-c "select usename, state, count(*) from pg_stat_activity group by 1,2 order by 1,2" 2>/dev/null || true
}

bootstrap() {
	ensure_dirs
	ensure_network
	ensure_hba
	ensure_userlist
	ensure_ini
	ensure_container
	wait_ready
	log "bootstrap: done. add a project with: $SELF_PATH add-project <role> (password on stdin)"
}

main() {
	require_root
	local cmd="${1:-}"
	shift || true
	case "$cmd" in
	bootstrap) bootstrap ;;
	add-project) add_project "${1:?role}" ;;
	add-monitor) add_monitor ;;
	drop-monitor) drop_monitor ;;
	drop-project) drop_project "${1:?role}" ;;
	pools) pools ;;
	console) console "${1:?sql}" ;;
	reload) reload ;;
	verify) verify ;;
	*)
		sed -n '2,30p' "$0" >&2
		exit 1
		;;
	esac
}

main "$@"
