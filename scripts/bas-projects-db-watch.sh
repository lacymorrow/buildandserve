#!/usr/bin/env bash
#
# The watch for projects-db on the bas box. Two checks, one job, one log.
#
# ## Check 1: the certificate the server actually serves (LAC-6054)
#
# Every project URL is `sslmode=verify-full` against a 90-day Let's Encrypt
# cert. There is no partial degradation in that setup: a renewal that stops
# working is a simultaneous hard outage for every project on the box, arriving
# with no warning on a date nobody is watching.
#
# It measures the cert the server serves, not the files on disk. That is the
# whole design, and it covers three faults instead of one:
#
#   1. Renewal stopped running. The served cert runs down toward expiry.
#   2. Renewal ran but the reload never took. The box serves the OLD cert while
#      a fresh one sits in /etc/letsencrypt. certbot does not retry a deploy
#      hook once the cert itself is fresh, so nothing else in the system
#      notices this, and a check that read the files would call it healthy.
#      Reading the served cert catches it as case 1, with weeks of runway.
#   3. The served cert stops naming the host, so every verify-full client
#      breaks at once.
#
# It runs over the public name and the public port, the same path the apps take,
# so a DNS change or a closed firewall port shows up here too.
#
# ## Check 2: authentication failures from the public internet (LAC-6059)
#
# `log_connections` has been on since the box was built and nothing read it.
# tcp/26432 is world-open for Vercel (LAC-6056), scram is the only thing
# standing between the internet and five project databases, and a password
# being guessed at produced exactly as much noise as a quiet night.
#
# Two FATALs are counted, over the last hour, from sources outside the tailnet:
#
#   password authentication failed   someone has a username and is trying
#                                    passwords, or an app is deployed with a
#                                    stale one
#   no pg_hba.conf entry             someone is reaching for a database or a
#                                    role that is not theirs, which is the
#                                    shape of enumeration rather than a typo
#
# Postgres does not put the client address on the `password authentication
# failed` line, only on the `connection received` line logged earlier for the
# same backend PID, so the two are correlated by PID to get a source. The
# `no pg_hba.conf entry` line carries its own host.
#
# The log is read with `docker logs --since`, because `logging_collector` is
# off and there is no file to tail. That makes the container's json-file log
# the thing this depends on, which is why LAC-6059 capped it at 10m x 5: an
# uncapped container log filling a 75 GB disk is its own outage, and it would
# be caused by the very brute-force burst this is here to report.
#
# ## Check 3: the private client CA and the certs it issued (LAC-6060)
#
# Projects that require a client certificate fail together, on one date, when
# the CA or an issued cert expires. That is the same class of fault as a failed
# Let's Encrypt renewal and it shares this job rather than getting its own.
#
# The certs are 10-year, so this is not a monthly worry; it is a worry about a
# date nobody will be around to remember, which is exactly the kind a watch is
# for. The warning threshold is half a year, because reissuing means editing
# five Vercel projects by hand and that is scheduled work, not an incident.
#
# It also catches the live fault with a short fuse: ssl_ca_file pointing at a
# file that is gone. The running server holds the CA in memory and keeps
# working, so nothing looks wrong until the next restart, which then fails.
#
# This half reads the box over ssh, like the auth check and for the same
# reason: the CA is a file on the box, not something a client can see.
#
# ## Check 4: the certificate the POOLER serves (LAC-6122)
#
# PgBouncer on :26433 terminates TLS with the same Let's Encrypt pair, read from
# the same mount, and holds it in memory. certbot's deploy hook reloads Postgres
# and, before LAC-6122, did not reload the pooler, so a renewal could land with
# :26432 perfect and the pooler still serving a certificate that expires. Every
# pooled app is `sslmode=verify-full`, so that is a timed total outage of every
# pooled project, and check 1 cannot see it: it reads a different port.
#
# Read over ssh rather than over the public internet, like check 3 and for a
# duller reason: tcp/26433 is closed at the Hetzner firewall until the LAC-6077
# gate opens it, so probing it from here would report a closed port as an outage.
#
# ## Cadence
#
# Hourly, because an auth-failure threshold measured per hour is worth nothing
# reported once a day. The cert check is the slow one and does not need the
# cadence, so it runs at most once per CERT_EVERY_HOURS and skips otherwise.
# The stamp file, rather than a fixed hour of the day, is deliberate: this runs
# on a laptop that sleeps, and a fixed hour is a cert check silently skipped on
# every day the lid was shut at the wrong moment.
#
# ## Silence means healthy
#
# Exit 0 healthy and silent. Exit 1 problem, printed, and Slacked with
# `--notify`. Exit 3 the run could not prove anything and is void.
#
# Exit 3 is not politeness. This host has gone fully DNS-blind twice
# (LAC-5286), and a watch that reads its own broken resolver as "the database
# is down" is a watch everyone learns to ignore. Same ruling as LAC-5278 made
# for the store watch: a fault on our side is never an incident on theirs. The
# auth check voids on its own if the tailnet is down, rather than paging,
# because the cert check runs over the public internet and will say so if the
# box is genuinely gone.
#
# Runbook: docs/ops/bas-projects-db.md
set -uo pipefail

DB_HOST=${DB_HOST:-projects-db.cloud0.dev}
DB_PORT=${DB_PORT:-26432}
# certbot renews at 30 days remaining and its timer runs twice a day. Below this
# the renewal path has already failed dozens of times in a row, which is a real
# fault; above it, a cert in its ordinary renewal window would page every month.
WARN_DAYS=${WARN_DAYS:-21}
PUBLIC_RESOLVER=${PUBLIC_RESOLVER:-1.1.1.1}
# A name that is not ours, so "can this host do DNS at all" is answered without
# reference to the thing being checked.
CONTROL_NAME=${CONTROL_NAME:-cloudflare.com}
SLACK_API_URL=${SLACK_API_URL:-https://slack.com/api/chat.postMessage}
SLACK_TOKEN=${PROJECTS_DB_SLACK_TOKEN:-}
SLACK_CHANNEL=${PROJECTS_DB_SLACK_CHANNEL:-}
# Same file and key the tailscale and power watches read, so this host has one
# bot token to rotate rather than a third copy of it.
SLACK_TOKEN_FILE=${SLACK_TOKEN_FILE:-$HOME/.openclaw/config.json}

# The box, over the tailnet. Ops left the public port in LAC-6059 and this is
# ops: it reads a container log over ssh, so it has no business on 26432.
BAS_SSH=${BAS_SSH:-root@bas.hyrax-boga.ts.net}
# Overridable so the tests can hand the script a log without a host to read it
# from. Same reason the tailscale watchdog takes TS_WATCHDOG_DIG.
SSH_BIN=${SSH_BIN:-ssh}
CONTAINER=${CONTAINER:-projects-db}
# Where bootstrap installs the box-side script. Overridable for the tests.
BOX_SCRIPT=${BOX_SCRIPT:-/usr/local/sbin/bas-projects-db.sh}
AUTH_WINDOW=${AUTH_WINDOW:-60m}
# Failures per hour from outside the tailnet before this is worth waking anyone.
# Legitimate traffic produces zero: every caller holds a password that works, so
# anything sustained here is either an attack or an app deployed with a stale
# credential, and both are worth the same page. 20 leaves room for one app
# restarting into a bad secret a few times without crying wolf.
AUTH_FAIL_THRESHOLD=${AUTH_FAIL_THRESHOLD:-20}
# How stale the cert check may get. 20 rather than 24 so an hourly job never
# skips a day by drifting a few minutes.
CERT_EVERY_HOURS=${CERT_EVERY_HOURS:-20}
STATE_DIR=${STATE_DIR:-$HOME/.paperclip/state}
# The projects-db credential files on this host. Checked for mode, not read.
SECRETS_DIR=${SECRETS_DIR:-$HOME/.paperclip/secrets}
SECRETS_GLOB=${SECRETS_GLOB:-*-db.env*}
CERT_STAMP=${CERT_STAMP:-$STATE_DIR/projects-db-cert-checked-at}

NOTIFY=0
SKIP_CERT=0
for arg in "$@"; do
	case "$arg" in
	--notify) NOTIFY=1 ;;
	--cert-now) CERT_EVERY_HOURS=0 ;;
	--auth-only) SKIP_CERT=1 ;;
	--help | -h)
		echo "usage: $0 [--notify] [--cert-now] [--auth-only]"
		exit 0
		;;
	*)
		echo "unknown argument: $arg" >&2
		exit 2
		;;
	esac
done

# openssl, not psql: this needs no password, so the watch holds no credential
# for any project database. Postgres negotiates TLS inside its own protocol
# rather than on connect, which is what -starttls postgres is for.
#
# Connect by IP with -servername, having resolved through a resolver named by
# IP. A broken system resolver then cannot make this report a false outage, and
# SNI still carries the name the cert has to match.
serve_probe() {
	local ip=$1 extra=${2:-}
	# shellcheck disable=SC2086
	printf 'Q\n' | openssl s_client -starttls postgres \
		-connect "$ip:$DB_PORT" -servername "$DB_HOST" $extra 2>&1
}

served_pem() {
	serve_probe "$1" | sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p'
}

slack_token() {
	if [ -n "$SLACK_TOKEN" ]; then printf '%s' "$SLACK_TOKEN"; return 0; fi
	[ -r "$SLACK_TOKEN_FILE" ] || return 1
	jq -r '.channels.slack.botToken // empty' "$SLACK_TOKEN_FILE" 2>/dev/null
}

slack_channel() {
	if [ -n "$SLACK_CHANNEL" ]; then printf '%s' "$SLACK_CHANNEL"; return 0; fi
	[ -r "$SLACK_TOKEN_FILE" ] || return 1
	jq -r '.channels.slack.dmChannel // .channels.slack.channel // empty' "$SLACK_TOKEN_FILE" 2>/dev/null
}

page() {
	local text=$1 token channel payload
	[ "$NOTIFY" = "1" ] || return 0
	token=$(slack_token) || true
	channel=$(slack_channel) || true
	if [ -z "${token:-}" ] || [ -z "${channel:-}" ]; then
		echo "cannot page: no slack token or channel (set PROJECTS_DB_SLACK_TOKEN/_CHANNEL or $SLACK_TOKEN_FILE)" >&2
		return 1
	fi
	payload=$(TEXT="$text" CHANNEL="$channel" python3 -I -c '
import json, os
print(json.dumps({"channel": os.environ["CHANNEL"], "text": os.environ["TEXT"]}))')
	curl -sS -m 15 -X POST "$SLACK_API_URL" \
		-H "Authorization: Bearer $token" \
		-H 'Content-Type: application/json; charset=utf-8' \
		--data "$payload" >/dev/null 2>&1 ||
		echo "slack post failed" >&2
}

# Two globals rather than return values, because each check can turn up several
# findings and bash has no way to hand back a list. PROBLEMS pages. VOIDS does
# not: it records that a check could not prove anything, which is a different
# claim from "everything is fine" and must never be reported as either.
PROBLEMS=()
VOIDS=()

# ---------------------------------------------------------------- cert check

check_cert() {
	local ip control pem end days

	ip=$(dig "@$PUBLIC_RESOLVER" +short +time=3 +tries=2 "$DB_HOST" A 2>/dev/null |
		grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)
	if [ -z "$ip" ]; then
		# Decide whose fault it is before saying anything. If a name that is not
		# ours also fails, this host cannot do DNS and the run proves nothing.
		control=$(dig "@$PUBLIC_RESOLVER" +short +time=3 +tries=2 "$CONTROL_NAME" A 2>/dev/null |
			grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)
		if [ -z "$control" ]; then
			VOIDS+=("cert: this host cannot resolve $CONTROL_NAME via $PUBLIC_RESOLVER either, so nothing about projects-db was proven")
			return 1
		fi
		PROBLEMS+=("$DB_HOST does not resolve, but $CONTROL_NAME does. The DNS record is gone, and every verify-full client is down.")
		return 0
	fi

	pem=$(served_pem "$ip")
	if [ -z "$pem" ]; then
		PROBLEMS+=("no TLS cert served at $DB_HOST ($ip):$DB_PORT. Container down, or tcp/$DB_PORT closed.")
		return 0
	fi

	end=$(printf '%s\n' "$pem" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
	if [ -z "$end" ]; then
		VOIDS+=("cert: served something that is not a parseable certificate at $DB_HOST:$DB_PORT")
		return 1
	fi
	# BSD date on this host; -j -f parses, and the GNU form is the fallback so
	# the same script works if this ever runs on the box.
	local end_epoch
	end_epoch=$(date -j -f '%b %d %T %Y %Z' "$end" +%s 2>/dev/null ||
		date -u -d "$end" +%s 2>/dev/null)
	if [ -z "$end_epoch" ]; then
		VOIDS+=("cert: could not parse the certificate end date '$end'")
		return 1
	fi
	days=$(((end_epoch - $(date -u +%s)) / 86400))

	if [ "$days" -lt "$WARN_DAYS" ]; then
		PROBLEMS+=("served cert expires in ${days}d ($end). certbot renews at 30d, so renewal or the reload has been failing for weeks.")
	fi

	# -verify_hostname and -verify_return_error together are the whole contract a
	# verify-full client enforces: chain to a trusted root, and the name matches.
	# Checked against this host's trust store, which is a different store from the
	# one the apps use, so a passing check here is the weaker of the two claims
	# and a failing one is unambiguous.
	if ! serve_probe "$ip" "-verify_hostname $DB_HOST -verify_return_error" |
		grep -q '^Verification: OK'; then
		PROBLEMS+=("served cert fails verify-full against this host's trust store: $(serve_probe "$ip" "-verify_hostname $DB_HOST -verify_return_error" | grep -i 'verif' | head -1)")
	fi
	return 0
}

cert_is_due() {
	[ "$SKIP_CERT" = "1" ] && return 1
	[ "$CERT_EVERY_HOURS" -eq 0 ] && return 0
	[ -r "$CERT_STAMP" ] || return 0
	local last now
	last=$(cat "$CERT_STAMP" 2>/dev/null)
	case "$last" in '' | *[!0-9]*) return 0 ;; esac
	now=$(date -u +%s)
	[ $(((now - last) / 3600)) -ge "$CERT_EVERY_HOURS" ]
}

# ---------------------------------------------------------------- auth check

# Postgres writes the client address on the `connection received` line and the
# failure on a later line for the same backend PID, so a source can only be had
# by correlating the two. Doing that in awk was tried and is unreadable; the
# address-range arithmetic alone wants a real ipaddress type.
#
# Reads the log on stdin. Prints `total <n>` first, then one line per source,
# busiest first. Anything inside the tailnet or on a private range is dropped
# before counting: those are ops and the container bridge, not the internet.
AUTH_PARSER='
import ipaddress, re, sys
from collections import defaultdict

# Named explicitly rather than deferring to ipaddress.is_private, which also
# covers the TEST-NET documentation ranges. Those are not ours, nobody
# legitimately connects from one, and silently dropping them would mean the
# only addresses a test can safely use are the ones the check ignores.
OURS = [ipaddress.ip_network(n) for n in (
    "127.0.0.0/8", "::1/128",                                 # the box talking to itself
    "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",          # RFC1918, incl. the docker bridge
    "169.254.0.0/16", "fe80::/10",                            # link-local
    "100.64.0.0/10", "fd7a:115c:a1e0::/48",                   # the tailnet: this is ops
)]
received = re.compile(r"\[(\d+)\] LOG:\s+connection received: host=(\S+)")
pw_fail = re.compile(r"\[(\d+)\] FATAL:\s+password authentication failed for user \"([^\"]*)\"")
no_hba = re.compile(r"FATAL:\s+no pg_hba.conf entry for host \"([^\"]*)\", user \"([^\"]*)\", database \"([^\"]*)\"")

def external(host):
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return not any(ip in net for net in OURS)

host_of_pid, counts, detail = {}, defaultdict(int), defaultdict(lambda: defaultdict(int))
for line in sys.stdin:
    m = received.search(line)
    if m:
        host_of_pid[m.group(1)] = m.group(2)
        continue
    m = pw_fail.search(line)
    if m:
        host = host_of_pid.get(m.group(1))
        if host and external(host):
            counts[host] += 1
            detail[host]["password/" + m.group(2)] += 1
        continue
    m = no_hba.search(line)
    if m and external(m.group(1)):
        counts[m.group(1)] += 1
        detail[m.group(1)]["no-hba/%s->%s" % (m.group(2), m.group(3))] += 1

print("total %d" % sum(counts.values()))
for host, n in sorted(counts.items(), key=lambda kv: -kv[1])[:5]:
    what = ", ".join("%s x%d" % (k, v) for k, v in sorted(detail[host].items(), key=lambda kv: -kv[1])[:3])
    print("  %-16s %3d  %s" % (host, n, what))
'

check_auth() {
	local log report total
	# BatchMode so a missing key fails in seconds instead of hanging a cron job
	# on a password prompt nobody will ever see.
	log=$("$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=10 "$BAS_SSH" \
		"docker logs --since $AUTH_WINDOW $CONTAINER" 2>&1)
	if [ $? -ne 0 ] || [ -z "$log" ]; then
		VOIDS+=("auth: could not read $CONTAINER logs over the tailnet at $BAS_SSH, so no claim is made about authentication failures")
		return 1
	fi

	report=$(printf '%s\n' "$log" | python3 -I -c "$AUTH_PARSER" 2>/dev/null)
	if [ -z "$report" ]; then
		VOIDS+=("auth: could not parse $CONTAINER logs")
		return 1
	fi

	total=$(printf '%s\n' "$report" | sed -n '1s/^total //p')
	case "$total" in '' | *[!0-9]*)
		VOIDS+=("auth: unexpected parser output")
		return 1
		;;
	esac

	if [ "$total" -gt "$AUTH_FAIL_THRESHOLD" ]; then
		PROBLEMS+=("$(printf '%s authentication failures from outside the tailnet in the last %s (threshold %s). Either a password is being guessed at on the open port, or an app is deployed with a stale credential.\n%s' \
			"$total" "$AUTH_WINDOW" "$AUTH_FAIL_THRESHOLD" "$(printf '%s\n' "$report" | tail -n +2)")")
	fi
	return 0
}

# -------------------------------------------------------- client-cert check

# Runs the box's own `client-cert-check`, rather than reimplementing it here.
# The box is where the CA lives and the thresholds already have one home in
# scripts/bas-projects-db.sh; a second copy on this laptop would drift.
#
# Exit 0 clean, exit 1 with findings on stdout, anything else is ssh or a box
# that does not have the command yet, which proves nothing and must void.
check_client_certs() {
	local out rc
	out=$("$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=10 "$BAS_SSH" \
		"$BOX_SCRIPT client-cert-check" 2>&1)
	rc=$?

	if [ "$rc" -eq 0 ]; then
		return 0
	fi

	if [ "$rc" -eq 1 ] && printf '%s\n' "$out" | grep -q 'client-certificate problem'; then
		while IFS= read -r line; do
			case "$line" in
			'  - '*) PROBLEMS+=("${line#  - }") ;;
			esac
		done <<-FINDINGS
			$out
		FINDINGS
		return 0
	fi

	VOIDS+=("client certs: could not run client-cert-check on $BAS_SSH (exit $rc), so nothing was proven about client-certificate expiry: $(printf '%s\n' "$out" | head -n1)")
	return 1
}

# -------------------------------------------------------------- pooler cert

# Same shape as check_client_certs, and for the same two reasons: the box is
# where the certificate and the pooler both live, and a threshold with two homes
# drifts. Silent and 0 when the pooler is healthy or absent.
check_pooler_cert() {
	local out rc
	out=$("$SSH_BIN" -o BatchMode=yes -o ConnectTimeout=10 "$BAS_SSH" \
		"$BOX_SCRIPT pooler-cert-check" 2>&1)
	rc=$?

	if [ "$rc" -eq 0 ]; then
		return 0
	fi

	if [ "$rc" -eq 1 ] && printf '%s\n' "$out" | grep -q 'pooler certificate problem'; then
		while IFS= read -r line; do
			case "$line" in
			'  - '*) PROBLEMS+=("${line#  - }") ;;
			esac
		done <<-FINDINGS
			$out
		FINDINGS
		return 0
	fi

	VOIDS+=("pooler cert: could not run pooler-cert-check on $BAS_SSH (exit $rc), so nothing was proven about the certificate on the pooled port: $(printf '%s\n' "$out" | head -n1)")
	return 1
}

# ------------------------------------------------------- secret file modes

# Every one of these holds a plaintext password for a live database on a port
# that is open to 0.0.0.0/0, so the file mode is the entire protection.
#
# This exists because a doc line was not enough. Three separate runs edited
# these files on 2026-10-28 (LAC-6054, LAC-6059, LAC-6060) and one of them left
# four backup copies at 644 for about five hours. The cause is dull and will
# recur: the agent shell's umask here is 022, so anything that creates a file
# without an explicit mode gets 644, and chmod-ing the file you meant to write
# does not cover the backup copy you made first.
#
# Nothing here reads a file or logs a name beyond its path. `*-db.env*` is
# deliberately narrow: this is the projects-db credential family, which is what
# this runbook owns. A sweep of every secret on this host is a different job
# and belongs with cred-scrub, which does not check modes today.
check_secret_modes() {
	local f mode bad=()
	# BSD stat first, as on zero; the GNU form is the fallback, same rule as
	# the date parsing above.
	for f in "$SECRETS_DIR"/$SECRETS_GLOB; do
		[ -f "$f" ] || continue
		mode=$(stat -f '%Lp' "$f" 2>/dev/null || stat -c '%a' "$f" 2>/dev/null)
		[ -n "$mode" ] || continue
		[ "$mode" = "600" ] && continue
		bad+=("$(basename "$f") is $mode")
	done

	if [ "${#bad[@]}" -gt 0 ]; then
		PROBLEMS+=("$(printf '%s projects-db credential file(s) are not mode 600. Each holds a plaintext password for a database reachable from the internet, so the mode is the only thing protecting it. Fix: chmod 600 %s/%s\n%s' \
			"${#bad[@]}" "$SECRETS_DIR" "$SECRETS_GLOB" "$(printf '      %s\n' "${bad[@]}")")")
	fi
}

# ---------------------------------------------------------------- reporting

main() {
	mkdir -p "$STATE_DIR" 2>/dev/null

	check_secret_modes
	check_auth

	if cert_is_due; then
		# Stamp only on a run where both halves proved something. A void must
		# not buy the cert another CERT_EVERY_HOURS of silence, and the two
		# halves fail independently: the server cert is read over the public
		# internet, the client CA over the tailnet.
		# Both, never short-circuited: they fail independently and for
		# unrelated reasons, so a DNS-blind laptop must not also silently skip
		# the client-cert half, which needs no DNS at all.
		local proved=0
		check_cert || proved=1
		check_client_certs || proved=1
		check_pooler_cert || proved=1
		[ "$proved" -eq 0 ] && date -u +%s >"$CERT_STAMP" 2>/dev/null
	fi

	if [ "${#PROBLEMS[@]}" -gt 0 ]; then
		printf 'projects-db problem on %s:\n' "$DB_HOST"
		printf '  - %s\n' "${PROBLEMS[@]}"
		page "$(printf 'projects-db problem on %s:\n%s\nRunbook: docs/ops/bas-projects-db.md' \
			"$DB_HOST" "$(printf '  - %s\n' "${PROBLEMS[@]}")")"
		exit 1
	fi

	if [ "${#VOIDS[@]}" -gt 0 ]; then
		printf '%s\n' "${VOIDS[@]}"
		exit 3
	fi

	exit 0
}

main
