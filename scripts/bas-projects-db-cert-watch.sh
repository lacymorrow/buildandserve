#!/usr/bin/env bash
#
# Cert-expiry watch for projects-db (LAC-6054).
#
# Every project URL is now `sslmode=verify-full` against a 90-day Let's Encrypt
# cert. There is no partial degradation in that setup: a renewal that stops
# working is a simultaneous hard outage for every project on the box, arriving
# with no warning on a date nobody is watching. This file exists for that one
# failure.
#
# ## It measures the cert the server serves, not the files on disk
#
# That is the whole design, and it covers three faults instead of one:
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
# It also runs over the public name and the public port, the same path the apps
# take, so a DNS change or a closed firewall port shows up here too.
#
# ## Silence means healthy
#
# Exit 0 healthy and silent. Exit 1 problem, printed, and Slacked with
# `--notify`. Exit 3 the run could not prove anything and is void.
#
# Exit 3 is not politeness. This host has gone fully DNS-blind twice
# (LAC-5286), and a watch that reads its own broken resolver as "the database
# is down" is a watch everyone learns to ignore. Same ruling as LAC-5278 made
# for the store watch: a fault on our side is never an incident on theirs.
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

NOTIFY=0
for arg in "$@"; do
	case "$arg" in
	--notify) NOTIFY=1 ;;
	--help | -h)
		echo "usage: $0 [--notify]"
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

main() {
	local ip control pem end days problems=()

	ip=$(dig "@$PUBLIC_RESOLVER" +short +time=3 +tries=2 "$DB_HOST" A 2>/dev/null |
		grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)
	if [ -z "$ip" ]; then
		# Decide whose fault it is before saying anything. If a name that is not
		# ours also fails, this host cannot do DNS and the run proves nothing.
		control=$(dig "@$PUBLIC_RESOLVER" +short +time=3 +tries=2 "$CONTROL_NAME" A 2>/dev/null |
			grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)
		if [ -z "$control" ]; then
			echo "void: this host cannot resolve $CONTROL_NAME via $PUBLIC_RESOLVER either, so nothing about projects-db was proven"
			exit 3
		fi
		echo "projects-db: $DB_HOST does not resolve, but $CONTROL_NAME does. The DNS record is gone, and every verify-full client is down."
		page "projects-db: $DB_HOST no longer resolves. Every project URL is sslmode=verify-full and is down. Runbook: docs/ops/bas-projects-db.md"
		exit 1
	fi

	pem=$(served_pem "$ip")
	if [ -z "$pem" ]; then
		echo "projects-db: no TLS cert served at $DB_HOST ($ip):$DB_PORT"
		page "projects-db: nothing serving TLS at $DB_HOST:$DB_PORT. Container down, or tcp/$DB_PORT closed. Runbook: docs/ops/bas-projects-db.md"
		exit 1
	fi

	end=$(printf '%s\n' "$pem" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
	if [ -z "$end" ]; then
		echo "void: served something that is not a parseable certificate at $DB_HOST:$DB_PORT"
		exit 3
	fi
	# BSD date on this host; -j -f parses, and the GNU form is the fallback so
	# the same script works if this ever runs on the box.
	local end_epoch
	end_epoch=$(date -j -f '%b %d %T %Y %Z' "$end" +%s 2>/dev/null ||
		date -u -d "$end" +%s 2>/dev/null)
	if [ -z "$end_epoch" ]; then
		echo "void: could not parse the certificate end date '$end'"
		exit 3
	fi
	days=$(((end_epoch - $(date -u +%s)) / 86400))

	if [ "$days" -lt "$WARN_DAYS" ]; then
		problems+=("served cert expires in ${days}d ($end). certbot renews at 30d, so renewal or the reload has been failing for weeks.")
	fi

	# -verify_hostname and -verify_return_error together are the whole contract a
	# verify-full client enforces: chain to a trusted root, and the name matches.
	# Checked against this host's trust store, which is a different store from the
	# one the apps use, so a passing check here is the weaker of the two claims
	# and a failing one is unambiguous.
	if ! serve_probe "$ip" "-verify_hostname $DB_HOST -verify_return_error" |
		grep -q '^Verification: OK'; then
		problems+=("served cert fails verify-full against this host's trust store: $(serve_probe "$ip" "-verify_hostname $DB_HOST -verify_return_error" | grep -i 'verif' | head -1)")
	fi

	if [ "${#problems[@]}" -eq 0 ]; then
		exit 0
	fi
	printf 'projects-db cert problem on %s:\n' "$DB_HOST"
	printf '  - %s\n' "${problems[@]}"
	page "$(printf 'projects-db cert problem on %s:\n%s\nEvery project URL is sslmode=verify-full, so this becomes a hard outage for all of them. Runbook: docs/ops/bas-projects-db.md' "$DB_HOST" "$(printf '  - %s\n' "${problems[@]}")")"
	exit 1
}

main
