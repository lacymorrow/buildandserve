#!/usr/bin/env bash
# projects-db on the bas box: TLS-only Postgres 17 on projects-db.cloud0.dev:26432
# (128.140.50.130). Clients verify the server cert, so they connect to the name.
#
# Runs ON the bas box as root. Idempotent: every step checks before it acts, so
# re-running it after a partial failure is safe.
#
#   build-image                build projects-db-pgbackrest:17 (postgres + pgbackrest + pgvector), then recreate the container by hand, see the runbook
#   bootstrap                  swap, /data dirs, LE cert, renewal hook, pg_hba, container, client CA
#   add-project <name>         one role + one database + one hostssl line, then reload
#   add-preview <name>         the same for <name>_preview, the preview-deploy pair
#   cert-deploy                install the current LE cert and reload postgres
#   cert-check                 expiry, hostname, served-vs-disk drift, client CA. Silent when healthy
#   client-cert-check          the client-CA half of cert-check on its own, for the watch
#   ca-init                    create the private client CA and point ssl_ca_file at it
#   client-cert <role>         mint a 10-year client cert, CN=<role>, print it base64 for Vercel
#   require-client-cert <role> that role needs a client cert from off-tailnet. Reversible
#   relax-client-cert <role>   put that role back to password-only. The rollback lever
#   allow-monitor-pooler       fleet-health's role may reach its database through the pooler
#   deny-monitor-pooler        take that back; the direct port is untouched
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
# Built locally from scripts/projects-db.Dockerfile (LAC-6218): postgres:17-alpine
# plus pgbackrest and pgvector. `build-image` produces it; there is no registry.
IMAGE=projects-db-pgbackrest:17
DOCKERFILE_SRC=${DOCKERFILE_SRC:-/usr/local/share/projects-db/Dockerfile}
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
# The private client CA (LAC-6060). Nothing to do with the Let's Encrypt server
# cert: that one authenticates the box to clients, this one authenticates clients
# to the box. They are separate chains on purpose, because they answer separate
# questions and have separate blast radii.
#
# The CA private key lives OUTSIDE $CONF. $CONF is bind-mounted into the
# container, so a key in there would be reachable from inside Postgres; the only
# thing the server needs is the public certificate, which is copied in.
CA="$ROOT/ca"
CA_KEY="$CA/ca.key"
CA_CRT="$CA/ca.crt"
CA_ISSUED="$CA/issued"
# What the container sees, read-only, via the /pgconf mount. Overridable only so
# the revert path below can be exercised against a path that does not exist;
# nothing in normal operation sets it.
CLIENT_CA_SERVED="$CONF/clients-ca.crt"
CLIENT_CA_IN_CONTAINER=${CLIENT_CA_IN_CONTAINER:-/pgconf/clients-ca.crt}
# 10 years for both. A client-cert expiry is a simultaneous outage for every
# project on the box, which is the one failure this design must not add, so the
# fuse is long and the expiry is watched rather than remembered.
CA_DAYS=${CA_DAYS:-3650}
CLIENT_DAYS=${CLIENT_DAYS:-3650}
# Warn early enough that reissuing is a scheduled job and not an incident. A
# client cert is reissued by hand into five Vercel projects, so a month is not
# enough runway; half a year is.
CA_WARN_DAYS=${CA_WARN_DAYS:-180}
CLIENT_WARN_DAYS=${CLIENT_WARN_DAYS:-180}
# Ops reaches the box over the tailnet, where WireGuard has already authenticated
# both ends. That path stays password-only so a botched client-cert rollout
# cannot lock ops out of the recovery path as well as the apps.
TAILNET_CIDR=${TAILNET_CIDR:-100.64.0.0/10}
# The PgBouncer container's Docker network (LAC-6076). Private to this box: it is
# a user-defined bridge with no route in from anywhere, so a line scoped to it is
# reachable only by a container this box's root attached to that network.
POOLER_CIDR=${POOLER_CIDR:-172.31.0.0/24}
# uid/gid of the postgres user inside the postgres:17-alpine base
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

	local rc=0
	if (( ${#problems[@]} > 0 )); then
		printf 'projects-db cert problem on %s:\n' "$DB_HOST"
		printf '  - %s\n' "${problems[@]}"
		rc=1
	fi
	# LAC-6060. A client-cert expiry is the same class of fault as a server-cert
	# expiry, with the same blast radius, so it belongs in the check people
	# already run rather than in a second one they do not.
	client_cert_check || rc=1
	return $rc
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

build_image() {
	[[ -r "$DOCKERFILE_SRC" ]] || { echo "no Dockerfile at $DOCKERFILE_SRC" >&2; exit 1; }
	local ctx
	ctx=$(mktemp -d)
	cp "$DOCKERFILE_SRC" "$ctx/Dockerfile"
	# Keep the previous image as :17-prev so a bad build is one retag from undone.
	docker tag "$IMAGE" "${IMAGE}-prev" 2>/dev/null || true
	log "image: building $IMAGE"
	docker build -q -t "$IMAGE" "$ctx" >/dev/null
	rm -rf "$ctx"
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
	# Three of these are LAC-6059 and are easy to drop by accident on a rewrite:
	# --log-opt caps a json-file log that was unbounded on a 75 GB disk and that
	# the auth-failure watch reads; 0.0.0.0 on the publish removes the [::]
	# listener, which reached Postgres through docker-proxy in userspace and so
	# bypassed the DOCKER-USER rate limit entirely and lost the client address;
	# authentication_timeout=10s cuts how long an unauthenticated session can hold
	# one of the 97 usable connection slots. See docs/ops/bas-projects-db.md.
	POSTGRES_PASSWORD="$pw" docker run -d \
		--name "$CONTAINER" \
		--restart unless-stopped \
		-m 1g \
		--log-opt max-size=10m \
		--log-opt max-file=5 \
		-p "0.0.0.0:$HOST_PORT:5432" \
		-v "$DATA:/var/lib/postgresql/data" \
		-v "$CONF:/pgconf:ro" \
		-v "$ROOT/pgbackrest.conf:/etc/pgbackrest/pgbackrest.conf:ro" \
		-v /data/backups/pgbackrest:/var/lib/pgbackrest \
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
		-c logging_collector=off \
		-c authentication_timeout=10s \
		-c wal_level=replica \
		-c archive_mode=on \
		-c archive_timeout=900 \
		-c "archive_command=pgbackrest --stanza=projects archive-push %p" >/dev/null

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

# ---------------------------------------------------------------- client CA
#
# LAC-6060. tcp/26432 is open to 0.0.0.0/0 and LAC-6056 ruled that it stays that
# way, because Vercel egress has no fixed IP range and a Vercel function can join
# neither a tailnet nor a TCP tunnel. That leaves a password as the only thing
# between the internet and five project databases, and LAC-6032 is this fleet's
# own measured instance of a leaked credential still authenticating weeks later.
#
# A client certificate is the access control that is actually available here: it
# is checked during the TLS handshake, before SCRAM starts, so a password on its
# own stops being a path in.
#
# CN = the role name, and `clientcert=verify-full` makes Postgres compare the CN
# against the Postgres user. A certificate minted for keepsake therefore cannot
# be used to reach shipkit_www even with shipkit_www's password.

# Create the CA, once. EC P-256 rather than RSA: same key type as the Let's
# Encrypt server cert, a third of the handshake cost, and every client here
# (OpenSSL 3, libpq 18, Node 22+) has supported it for years.
#
# pathlen:0 so this CA cannot sign an intermediate. There is no second tier here
# and a CA that cannot delegate is one less thing to reason about if the key
# ever leaks.
ensure_ca() {
	mkdir -p "$CA" "$CA_ISSUED"
	chmod 700 "$CA" "$CA_ISSUED"

	if [[ -f "$CA_KEY" && -f "$CA_CRT" ]]; then
		log "ca: present, expires $(openssl x509 -in "$CA_CRT" -noout -enddate | cut -d= -f2)"
	else
		log "ca: creating a ${CA_DAYS}-day root"
		(
			umask 077
			openssl ecparam -name prime256v1 -genkey -noout -out "$CA_KEY"
		)
		openssl req -x509 -new -key "$CA_KEY" -sha256 -days "$CA_DAYS" \
			-subj "/CN=projects-db client CA" \
			-addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
			-addext "keyUsage=critical,keyCertSign,cRLSign" \
			-out "$CA_CRT"
		log "ca: created, expires $(openssl x509 -in "$CA_CRT" -noout -enddate | cut -d= -f2)"
	fi
	chmod 600 "$CA_KEY"
	chmod 644 "$CA_CRT"

	# Only the public certificate crosses into the container.
	install -o "$PG_UID" -g "$PG_GID" -m 644 "$CA_CRT" "$CLIENT_CA_SERVED"
	log "ca: public cert installed at $CLIENT_CA_SERVED"
}

# `ssl_ca_file` is set with ALTER SYSTEM rather than a `-c` flag on the container
# command, and that is a deliberate difference from every other setting here.
#
# A `-c ssl_ca_file=...` pointing at a file that is missing is a container that
# will not start at all. ALTER SYSTEM writes postgresql.auto.conf, which is only
# written after the file exists, survives a restart the same way, and is a
# sighup setting so it costs a reload rather than a restart.
#
# Setting it does NOT force a client certificate on anybody. Postgres requests
# one once a CA is loaded, but whether a missing one is fatal is decided per
# pg_hba line by `clientcert`. Projects without that keyword keep connecting
# exactly as before, which is what makes a one-project-at-a-time rollout possible.
# The client-CA names the server advertises in the TLS handshake. Postgres only
# advertises a CA it actually loaded, so this is the authoritative read of
# whether ssl_ca_file took.
#
# It replaces a grep of the container log, and the reason is measured rather
# than stylistic. `pg_reload_conf()` returns when SIGHUP is sent, not when the
# postmaster has acted on it, so a log read straight afterwards races the
# reload: on 2026-10-28 the grep ran, found nothing, reported success, and
# Postgres wrote `SSL configuration was not reloaded` 6ms later. A handshake
# cannot be raced that way, because there is nothing to serve until the context
# is built. Same principle as `deploy_cert` reading the served certificate back
# instead of trusting the reload's exit code.
advertised_client_cas() {
	printf 'Q\n' | openssl s_client -starttls postgres \
		-connect "127.0.0.1:$HOST_PORT" -servername "$DB_HOST" 2>/dev/null |
		awk '/Acceptable client certificate CA names/ {f = 1; next}
		     /^(Requested|Shared|---)/ {f = 0}
		     f'
}

ca_is_live() {
	local cn
	[[ -r "$CA_CRT" ]] || return 1
	cn=$(openssl x509 -in "$CA_CRT" -noout -subject | sed -n 's/.*CN *= *//p')
	[[ -n "$cn" ]] || return 1
	advertised_client_cas | grep -qF "$cn"
}

# Put ssl_ca_file back and reload, so a rejected path never survives in
# postgresql.auto.conf. That is the exact failure the ALTER SYSTEM choice exists
# to avoid: the running server keeps its old TLS context and looks healthy, and
# the next restart reads a CA it cannot load and does not come up. Raised in the
# LAC-6062 review.
revert_ssl_ca_file() {
	local previous="$1" reason="$2"
	echo "ca: $reason; reverting ssl_ca_file" >&2
	if [[ -z "$previous" ]]; then
		psql_super -q -c "ALTER SYSTEM RESET ssl_ca_file"
	else
		psql_super -q -c "ALTER SYSTEM SET ssl_ca_file = '$previous'"
	fi
	psql_super -q -c "SELECT pg_reload_conf()" >/dev/null
	echo "ca: ssl_ca_file reverted to '${previous:-unset}', so the container will still start" >&2
	docker logs --tail 20 "$CONTAINER" >&2 || true
	exit 1
}

ensure_ssl_ca_file() {
	local previous since marker waited seen
	previous=$(psql_super -tAc "show ssl_ca_file")
	if [[ "$previous" == "$CLIENT_CA_IN_CONTAINER" ]] && ca_is_live; then
		log "ca: ssl_ca_file already $previous, and the server is advertising it"
		return 0
	fi

	# RFC3339 with an explicit Z: a bare timestamp is read in the docker
	# daemon's local zone, which is not necessarily UTC. Two seconds of slack
	# so a sub-second boundary cannot drop the lines we are about to wait for.
	since=$(date -u -d '2 seconds ago' +%Y-%m-%dT%H:%M:%SZ)
	psql_super -q -c "ALTER SYSTEM SET ssl_ca_file = '$CLIENT_CA_IN_CONTAINER'"
	psql_super -q -c "SELECT pg_reload_conf()" >/dev/null
	log "ca: ssl_ca_file '${previous:-unset}' -> '$CLIENT_CA_IN_CONTAINER', waiting for the reload to land"

	# `pg_reload_conf()` returns when SIGHUP is sent, not when the postmaster
	# has acted on it. Reading the log straight afterwards is a race, and it is
	# a race that fails open: measured on 2026-10-28, the grep ran, found
	# nothing, reported success, and Postgres wrote
	# `SSL configuration was not reloaded` six milliseconds later. So wait for
	# the line the postmaster always writes on a change, success or failure.
	marker="parameter \"ssl_ca_file\" changed to \"$CLIENT_CA_IN_CONTAINER\""
	waited=0
	seen=0
	while ((waited < 50)); do
		if docker logs --since "$since" "$CONTAINER" 2>&1 | grep -qF "$marker"; then
			seen=1
			break
		fi
		sleep 0.2
		waited=$((waited + 1))
	done
	if ((seen == 0)); then
		revert_ssl_ca_file "$previous" "postgres never acted on the reload within 10s"
	fi

	# The refusal, when there is one, lands in the same reload pass a few
	# milliseconds after the marker. One second of grace is several orders of
	# magnitude more than that.
	sleep 1
	if docker logs --since "$since" "$CONTAINER" 2>&1 | grep -q 'SSL configuration was not reloaded'; then
		revert_ssl_ca_file "$previous" "postgres refused the new SSL configuration"
	fi

	# Belt and braces, and not redundant: the log says the reload was accepted,
	# this says the server is really offering a client CA to connecting clients.
	# A server advertising nothing refuses every client certificate there is.
	if ! ca_is_live; then
		revert_ssl_ca_file "$previous" "the reload was accepted but the server advertises no client CA"
	fi
	log "ca: reload accepted and the server is advertising the client CA"
}

# One cert per role, CN = role name, printed once and not kept.
#
# The private key is generated in a tmpdir and shredded before this returns. The
# box keeps only the public certificate, under $CA_ISSUED, so expiry can be
# watched without the box holding a credential that lets anything connect. If a
# key is lost, mint another: it costs one command and invalidates nothing.
client_cert() {
	local role="$1"
	if [[ ! "$role" =~ ^[a-z][a-z0-9_]{1,30}$ ]]; then
		echo "role name must be lowercase [a-z][a-z0-9_]: got '$role'" >&2
		exit 1
	fi
	if [[ ! -f "$CA_KEY" ]]; then
		echo "no client CA at $CA_KEY; run $SELF_PATH ca-init" >&2
		exit 1
	fi
	# CN has to match a real role or the cert is unusable the moment
	# clientcert=verify-full is turned on, and the failure would land on the app.
	if ! psql_super -tAc "select 1 from pg_roles where rolname='$role'" | grep -qx 1; then
		echo "no role '$role' on this server; run $SELF_PATH add-project $role first" >&2
		exit 1
	fi

	local tmp
	tmp=$(mktemp -d)
	chmod 700 "$tmp"
	(
		umask 077
		openssl ecparam -name prime256v1 -genkey -noout -out "$tmp/client.key"
	)
	openssl req -new -key "$tmp/client.key" -subj "/CN=$role" -out "$tmp/client.csr" 2>/dev/null
	# clientAuth only. A cert that is also good for serverAuth is a cert that
	# could impersonate a server to anything that trusts this CA.
	openssl x509 -req -in "$tmp/client.csr" \
		-CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
		-days "$CLIENT_DAYS" -sha256 \
		-extfile <(printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\n') \
		-out "$tmp/client.crt" 2>/dev/null

	install -m 644 "$tmp/client.crt" "$CA_ISSUED/$role.crt"

	# base64 on one line. A multi-line PEM pasted into a Vercel environment
	# variable is the standard way this goes wrong: the dashboard keeps the
	# newlines, the deployment does not, and the failure reads as a TLS error
	# rather than as a mangled variable.
	cat <<-EOM

		# ---- $role, client certificate, expires $(openssl x509 -in "$tmp/client.crt" -noout -enddate | cut -d= -f2)
		# Paste these two into the Vercel project. Base64, single line, decoded at read.
		# There is no CA variable on purpose: the server cert is Let's Encrypt and the
		# client verifies it against the system trust store. See docs/ops/bas-projects-db.md.

		DATABASE_CLIENT_CERT_B64=$(base64 -w0 <"$tmp/client.crt")
		DATABASE_CLIENT_KEY_B64=$(base64 -w0 <"$tmp/client.key")
	EOM

	shred -u "$tmp/client.key" 2>/dev/null || rm -f "$tmp/client.key"
	rm -rf "$tmp"
	log "$role: client cert issued, public copy at $CA_ISSUED/$role.crt"
}

# Reload pg_hba and prove it parsed. A pg_hba.conf with a syntax error does not
# take: Postgres keeps the previous rules and writes a log line, so a zero exit
# from the reload means nothing. pg_hba_file_rules re-reads the file and reports
# per-line errors, which is the only way to see this from outside the log.
reload_hba_checked() {
	local bad
	psql_super -q -c "SELECT pg_reload_conf()" >/dev/null
	bad=$(psql_super -tAc "select count(*) from pg_hba_file_rules where error is not null")
	if [[ "$bad" != "0" ]]; then
		echo "hba: $bad line(s) failed to parse, the old rules are still in force:" >&2
		psql_super -c "select line_number, error from pg_hba_file_rules where error is not null" >&2
		return 1
	fi
	log "hba: reloaded, $(psql_super -tAc "select count(*) from pg_hba_file_rules") rule(s), no parse errors"
}

# Rewrite one project's hba lines to the cert-required pair. Separate from
# add-project on purpose: a project that needs a cert before its app has one is
# a project that is down, so this is always a second, deliberate step after the
# certificate is in the app's environment.
#
# Three lines, narrowest first:
#
#   hostssl p p 172.31.0.0/24   scram-sha-256                        <- the pooler
#   hostssl p p 100.64.0.0/10   scram-sha-256                        <- ops
#   hostssl p p all             scram-sha-256 clientcert=verify-full <- the internet
#
# pg_hba is first-match-wins and does not fall through on a failed auth, so an
# ops connection from the tailnet never reaches the last line and never needs
# a certificate. That is what keeps a bad rollout from locking ops out too.
#
# The pooler line is LAC-6076 and it has to come first for a different reason.
# PgBouncer terminates TLS, so it cannot forward an app's client certificate, and
# it holds one certificate globally rather than one per role -- so it could never
# satisfy `clientcert=verify-full` for more than a single role no matter how it
# were configured. Without this line a project flipped to cert-required is
# unreachable through the pooler. The certificate is still demanded, one hop
# earlier: `bas-pgbouncer.sh` checks the chain against this same private CA and
# binds the CN to the role before it ever opens a server connection.
#
# The issue proposed `hostssl all all 100.64.0.0/10` for the tailnet line. This
# keeps it per-project instead: the wildcard form would mean a leaked keepsake
# password reaches the shipkit database from any device on the tailnet, Lacy's
# phone included, which is the exact thing this file's one-line-per-project rule
# exists to prevent. Strictly tighter, same ops ergonomics.
require_client_cert() {
	local proj="$1"
	if [[ ! "$proj" =~ ^[a-z][a-z0-9_]{1,30}$ ]]; then
		echo "project name must be lowercase [a-z][a-z0-9_]: got '$proj'" >&2
		exit 1
	fi
	if [[ ! -f "$CA_ISSUED/$proj.crt" ]]; then
		echo "no client cert issued for $proj; run $SELF_PATH client-cert $proj first" >&2
		exit 1
	fi
	if ! grep -qE "^hostssl[[:space:]]+${proj}[[:space:]]+${proj}[[:space:]]" "$HBA"; then
		echo "no hba line for $proj; run $SELF_PATH add-project $proj first" >&2
		exit 1
	fi
	ensure_ssl_ca_file

	write_hba_pair "$proj" cert
}

# The rollback lever. One project at a time, same as the way in. Use it when an
# app is locked out and the certificate is not the thing you want to debug at
# that moment; the password is unchanged, so this restores service immediately.
relax_client_cert() {
	local proj="$1"
	if [[ ! "$proj" =~ ^[a-z][a-z0-9_]{1,30}$ ]]; then
		echo "project name must be lowercase [a-z][a-z0-9_]: got '$proj'" >&2
		exit 1
	fi
	if ! grep -qE "^hostssl[[:space:]]+${proj}[[:space:]]+${proj}[[:space:]]" "$HBA"; then
		echo "no hba line for $proj" >&2
		exit 1
	fi
	write_hba_pair "$proj" password
}

# Replace every hostssl line for $1 with the requested shape. Written as a full
# rewrite rather than an append or an in-place edit so it lands in the same place
# from any starting state, including a half-applied one.
write_hba_pair() {
	local proj="$1" mode="$2" backup="$HBA.bak" tmp="$HBA.new"
	cp -p "$HBA" "$backup"

	awk -v p="$proj" -v mode="$mode" -v tailnet="$TAILNET_CIDR" -v pooler="$POOLER_CIDR" '
		function emit() {
			if (mode == "cert") {
				printf "hostssl %-20s %-20s %-14s %s\n", p, p, pooler, "scram-sha-256"
				printf "hostssl %-20s %-20s %-14s %s\n", p, p, tailnet, "scram-sha-256"
				printf "hostssl %-20s %-20s %-14s %s\n", p, p, "all", "scram-sha-256 clientcert=verify-full"
			} else {
				printf "hostssl %-20s %-20s %-14s %s\n", p, p, "all", "scram-sha-256"
			}
		}
		$1 == "hostssl" && $2 == p && $3 == p {
			if (!done) { emit(); done = 1 }
			next
		}
		{ print }
	' "$HBA" >"$tmp"

	chown "$PG_UID:$PG_GID" "$tmp"
	chmod 644 "$tmp"
	mv -f "$tmp" "$HBA"

	if reload_hba_checked; then
		rm -f "$backup"
		if [[ "$mode" == "cert" ]]; then
			log "$proj: client certificate now required from off-tailnet"
		else
			log "$proj: back to password-only"
		fi
		return 0
	fi

	# Put the file back and reload again, so a parse error is a no-op rather
	# than a file nobody can reload until someone edits it by hand.
	mv -f "$backup" "$HBA"
	chown "$PG_UID:$PG_GID" "$HBA"
	psql_super -q -c "SELECT pg_reload_conf()" >/dev/null
	echo "$proj: hba rewrite rolled back, nothing changed" >&2
	exit 1
}

# The monitor role's own hba trio, which `write_hba_pair` cannot express. That
# function matches on database == user == project; fleet-health's role reads ONE
# project database and is not named after it, so its lines are
# `hostssl <some project db> fleet_monitor ...` and never match.
#
# LAC-6132. Without the pooler line here, a probe of the pooled port fails at the
# second hop rather than the first: the pooler accepts the client certificate,
# binds the CN to the role, and is then refused by Postgres, because PgBouncer
# presents no client certificate of its own on the server side and so lands on
# the `all` line with clientcert=verify-full. The card would read as a pooler
# fault when it is a missing grant.
#
# The database is read out of the role's existing lines rather than passed in or
# assumed. If the monitor is ever repointed at a different project database, this
# follows it; a hardcoded name would write a line for a database the role cannot
# reach and the probe would fail with the line looking correct.
#
# The widening is the same trade already taken for every pooled project, and no
# larger: the pooler's bridge is a user-defined Docker network with no route in
# from anywhere, so this line is reachable only by a container this box's root
# attached to that network. What it adds is that `fleet_monitor`'s password alone
# opens its one database FROM THERE, with no certificate. The role has CONNECT on
# that database and USAGE on no schema, so it is the least sensitive credential
# in the pooler's userlist.
monitor_hba() {
	local mode="$1" role="${MONITOR_ROLE:-fleet_monitor}" db
	local backup="$HBA.bak" tmp="$HBA.new"

	db=$(awk -v r="$role" '$1 == "hostssl" && $3 == r { print $2; exit }' "$HBA")
	if [[ -z "$db" ]]; then
		echo "$role has no hostssl line in $HBA, so there is no monitor path to widen." >&2
		echo "That role is provisioned by hand (LAC-5980); add its direct lines first." >&2
		exit 1
	fi

	cp -p "$HBA" "$backup"
	awk -v r="$role" -v d="$db" -v mode="$mode" \
		-v tailnet="$TAILNET_CIDR" -v pooler="$POOLER_CIDR" '
		function emit() {
			if (mode == "pooled") {
				printf "hostssl %-20s %-20s %-14s %s\n", d, r, pooler, "scram-sha-256"
			}
			printf "hostssl %-20s %-20s %-14s %s\n", d, r, tailnet, "scram-sha-256"
			printf "hostssl %-20s %-20s %-14s %s\n", d, r, "all", "scram-sha-256 clientcert=verify-full"
		}
		$1 == "hostssl" && $3 == r {
			if (!done) { emit(); done = 1 }
			next
		}
		{ print }
	' "$HBA" >"$tmp"

	chown "$PG_UID:$PG_GID" "$tmp"
	chmod 644 "$tmp"
	mv -f "$tmp" "$HBA"

	if reload_hba_checked; then
		rm -f "$backup"
		if [[ "$mode" == "pooled" ]]; then
			log "$role: may now reach $db through the pooler at $POOLER_CIDR"
		else
			log "$role: pooler line removed; the direct port is unchanged"
		fi
		return 0
	fi

	mv -f "$backup" "$HBA"
	chown "$PG_UID:$PG_GID" "$HBA"
	psql_super -q -c "SELECT pg_reload_conf()" >/dev/null
	echo "$role: hba rewrite rolled back, nothing changed" >&2
	exit 1
}

days_left() {
	local end end_epoch
	end=$(openssl x509 -in "$1" -noout -enddate 2>/dev/null | cut -d= -f2) || return 1
	[[ -n "$end" ]] || return 1
	end_epoch=$(date -u -d "$end" +%s 2>/dev/null) || return 1
	echo $(((end_epoch - $(date -u +%s)) / 86400))
}

# The client half of cert-check, separately callable because the watch on zero
# reaches this over ssh while its server-cert half deliberately runs over the
# public internet with no credentials at all.
#
# Three faults, all of which are a simultaneous outage for every project that
# requires a certificate, and none of which show up anywhere else:
#   1. the CA is running down toward expiry
#   2. an issued client cert is running down toward expiry
#   3. ssl_ca_file points at a file that is gone, so the next restart fails and
#      the running server is the only thing holding the configuration up
client_cert_check() {
	local problems=() d
	local requiring
	requiring=$(grep -cE '^hostssl.*clientcert=verify-full' "$HBA" 2>/dev/null || true)
	[[ -n "$requiring" ]] || requiring=0

	if [[ ! -f "$CA_CRT" ]]; then
		# Only a problem once something depends on it. A box that has never run
		# ca-init is not broken, it is just not using client certs yet.
		if ((requiring > 0)); then
			problems+=("$requiring hba line(s) require a client certificate but the CA at $CA_CRT is gone")
		fi
	else
		d=$(days_left "$CA_CRT") || d=""
		if [[ -z "$d" ]]; then
			problems+=("$CA_CRT is not a parseable certificate")
		elif ((d < CA_WARN_DAYS)); then
			problems+=("client CA expires in ${d}d; every project that requires a client cert goes down together on that date")
		fi
		if [[ ! -r "$CLIENT_CA_SERVED" ]]; then
			problems+=("$CLIENT_CA_SERVED is missing, so the container cannot read the CA on its next start. Fix: $SELF_PATH ca-init")
		elif ! cmp -s "$CA_CRT" "$CLIENT_CA_SERVED"; then
			problems+=("$CLIENT_CA_SERVED differs from $CA_CRT. Fix: $SELF_PATH ca-init")
		fi
	fi

	local f role
	for f in "$CA_ISSUED"/*.crt; do
		[[ -e "$f" ]] || break
		role=$(basename "$f" .crt)
		d=$(days_left "$f") || d=""
		if [[ -z "$d" ]]; then
			problems+=("$f is not a parseable certificate")
		elif ((d < CLIENT_WARN_DAYS)); then
			problems+=("client cert for $role expires in ${d}d; reissue with '$SELF_PATH client-cert $role' and update that project's Vercel env")
		fi
	done

	if ((requiring > 0)); then
		local live
		live=$(psql_super -tAc "show ssl_ca_file" 2>/dev/null) || live=""
		if [[ "$live" != "$CLIENT_CA_IN_CONTAINER" ]]; then
			problems+=("ssl_ca_file is '$live' but $requiring hba line(s) require a client certificate. Fix: $SELF_PATH ca-init")
		elif ! ca_is_live; then
			# `show` reports the configured value whether or not the server
			# managed to load it, so it is not proof. The handshake is.
			problems+=("ssl_ca_file is '$live' but the server is not advertising that CA in the handshake, so every client cert is being refused. Fix: $SELF_PATH ca-init")
		fi
	fi

	if ((${#problems[@]} == 0)); then
		return 0
	fi
	printf 'projects-db client-certificate problem:\n'
	printf '  - %s\n' "${problems[@]}"
	return 1
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
	echo "== client CA"
	if [[ -f "$CA_CRT" ]]; then
		openssl x509 -in "$CA_CRT" -noout -subject -enddate
		echo "ssl_ca_file=$(psql_super -tAc "show ssl_ca_file")"
		ls -la "$CA" "$CA_ISSUED"
		for f in "$CA_ISSUED"/*.crt; do
			[[ -e "$f" ]] || break
			printf '%s  ' "$(basename "$f")"
			openssl x509 -in "$f" -noout -subject -enddate | tr '\n' ' '
			echo
		done
	else
		echo "none (run ca-init)"
	fi
	if client_cert_check; then echo "client-cert-check: ok"; fi
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
build-image)
	require_root
	build_image
	;;
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
	# After the container, not before: ensure_ssl_ca_file needs a server to talk
	# to, and a CA file that exists before the server does buys nothing.
	ensure_ca
	ensure_ssl_ca_file
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
client-cert-check)
	client_cert_check
	;;
ca-init)
	ensure_ca
	ensure_ssl_ca_file
	;;
client-cert)
	client_cert "${2:?role name required}"
	;;
require-client-cert)
	require_client_cert "${2:?project name required}"
	;;
relax-client-cert)
	relax_client_cert "${2:?project name required}"
	;;
allow-monitor-pooler)
	monitor_hba pooled
	;;
deny-monitor-pooler)
	monitor_hba direct
	;;
verify)
	verify
	;;
*)
	echo "usage: $0 {build-image|bootstrap|add-project <name>|add-preview <name>|cert-deploy|cert-check|client-cert-check|ca-init|client-cert <role>|require-client-cert <role>|relax-client-cert <role>|allow-monitor-pooler|deny-monitor-pooler|verify}" >&2
	exit 2
	;;
esac
