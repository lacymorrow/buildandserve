#!/usr/bin/env bash
#
# Tells Lacy when the fleet has already gone dark (LAC-4874).
#
# Every other fleet watch (power, stranded, lease-loss, store, fleet-health,
# usage-governor) is a launchd job on Lacy's Mac, so all of them die with the
# machine they watch. On 2026-10-19 that Mac rebooted at 23:36:52 and sat at the
# FileVault prompt, alive and useless, for twelve hours. No signal left the
# building until Lacy sat down at the laptop.
#
# The power watch is the pre-mortem. This is the post-mortem, and the only
# reason it works is that it does not run on the Mac: cron on `library`, which
# is wired, always on, and has been up 58 days.
#
# It borrows the two properties that make the sibling watches readable:
#
#   1. Silence means the fleet is alive. The log records every poll so that
#      "quiet because healthy" can be told apart from "quiet because the watch
#      itself stopped". For a dead-man's switch that distinction is the product.
#   2. One message per thing that happened. One when the plane goes dark, one
#      when it comes back, and nothing in between. A monitor that repeats itself
#      every five minutes for twelve hours is a monitor nobody reads.
#
# Usage:
#   fleet-dark-watch.sh              # poll and log, print what it would send
#   fleet-dark-watch.sh --notify     # poll, log, and Slack-DM for real
#
# Exit codes: 0 = the plane answered, 1 = it did not, 2 = this script could not
# do its job (no curl, no jq, nowhere to write). 2 is never recorded as 0:
# "could not look" and "the fleet is fine" are the two readings this file exists
# to keep apart.

set -uo pipefail

# cron hands a job a nearly empty PATH, and this must not fail for a reason as
# boring as that. Homebrew is last so the same file runs on a Mac for tests.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/homebrew/bin"

# --- what it watches -------------------------------------------------------
#
# `--resolve` is load-bearing and here is the trap it avoids. library runs
# tailscaled with --accept-dns=false, so MagicDNS names do not resolve there and
# the plain hostname gives an instant http=000. Going by IP instead sends no SNI
# and Tailscale Serve's certificate needs the hostname, so that gives
# `curl: (35) TLS connect error`. A 000 and a TLS 35 both look like a firewall
# and neither one is. Pinning the name to the IP is the only form that answers.
#
# HOST_IP is zero's Tailscale address, which is stable per node. If it ever
# changes, `tailscale ip -4 zero` prints the new one.
HEALTH_HOST="${FLEET_DARK_WATCH_HOST:-zero.hyrax-boga.ts.net}"
HEALTH_IP="${FLEET_DARK_WATCH_IP:-100.86.145.8}"
HEALTH_URL="${FLEET_DARK_WATCH_URL:-https://${HEALTH_HOST}/api/health}"

# Long enough to ride out a loaded laptop, short enough that a wedged request
# cannot still be running when cron starts the next one.
CURL_TIMEOUT="${FLEET_DARK_WATCH_TIMEOUT:-10}"

# How long the plane must stay silent before Lacy hears about it. Three missed
# polls. Short enough to matter overnight, long enough that a control-plane
# restart or a laptop lid close does not page anybody.
DARK_AFTER_SECONDS="${FLEET_DARK_WATCH_DARK_AFTER:-900}"

# State and log live on the NVMe pool, addressed as /mnt/cachex rather than
# /mnt/user on purpose: the appdata share sets shareFloor=97.7G, the pool has
# less free than that, and so every write through shfs is refused with ENOSPC.
# /mnt/cachex is the same bytes without the share layer in the way.
WATCH_DIR="${FLEET_DARK_WATCH_DIR:-/mnt/cachex/appdata/fleet-dark-watch}"

# Who hears about it. Lacy's Slack DM, the same channel the power watch and the
# stranded-work watch already use, because an alert in a channel nobody reads is
# the failure this issue is about. Kept in one function so swapping the channel
# is a one-line change once Lacy names the one that should wake him at 23:30.
SLACK_CHANNEL="${FLEET_DARK_WATCH_SLACK_CHANNEL:-U3XC80UUQ}"
SLACK_TOKEN="${FLEET_DARK_WATCH_SLACK_TOKEN:-}"

# Falls back to a file so the cron line can stay clean. Unraid regenerates root's
# crontab onto /boot, which is FAT32 and carries no permission bits at all, so a
# token inlined there would be readable by anything that can see the flash. The
# pool is a real filesystem and can hold a 600.
SLACK_TOKEN_FILE="${FLEET_DARK_WATCH_SLACK_TOKEN_FILE:-$WATCH_DIR/slack-token}"

NOTIFY=0
for arg in "$@"; do
  case "$arg" in
    --notify) NOTIFY=1 ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

# Overridable so the tests can stand at a chosen moment instead of sleeping for
# fifteen real minutes to watch a fifteen-minute threshold.
now() { printf '%s' "${FLEET_DARK_WATCH_NOW:-$(date +%s)}"; }

# library runs GNU date, a Mac runs BSD date, and these two spell "format this
# epoch" differently. Both forms are here so one file covers the host it ships
# on and the host its tests run on.
at_epoch() { date -d "@$1" +"$2" 2>/dev/null || date -r "$1" +"$2"; }

# ISO-8601 back to an epoch, same two dialects. BSD date needs the fractional
# seconds and the Z stripped off and the zone named for it, so strip both: the
# endpoint sends `.071Z` today but a timestamp without the fraction must not
# turn the recovery duration into a guess.
iso_epoch() {
  local trimmed=${1%%.*}
  trimmed=${trimmed%Z}
  date -d "$1" +%s 2>/dev/null \
    || TZ=UTC date -j -f '%Y-%m-%dT%H:%M:%S' "$trimmed" +%s 2>/dev/null
}

STATE_FILE="$WATCH_DIR/state"
LOG_FILE="$WATCH_DIR/fleet-dark-watch.log"

# Every line carries the time it happened. The power watch shipped without this
# and reconstructing the 2026-10-19 outage needed kern.boottime cross-referenced
# against usage-governor.log precisely because its log could not say when
# anything happened.
log() { printf '%s %s\n' "$(at_epoch "$(now)" %Y-%m-%dT%H:%M:%S%z)" "$1" | tee -a "$LOG_FILE"; }

# --- pure-ish helpers, exercised directly by the tests ---------------------

# A duration in the units a person would say it in. The recovery message is
# worth shipping only if this number is in it.
fmt_duration() {
  local total=$1 d h m
  d=$((total / 86400)); h=$(((total % 86400) / 3600)); m=$(((total % 3600) / 60))
  if [ "$d" -gt 0 ]; then printf '%dd %dh %dm' "$d" "$h" "$m"
  elif [ "$h" -gt 0 ]; then printf '%dh%02dm' "$h" "$m"
  else printf '%dm' "$m"
  fi
}

# Read one key out of the state file without sourcing it. Sourcing would run
# whatever a truncated or half-written file happens to contain.
state_get() {
  [ -f "$STATE_FILE" ] || return 0
  sed -n "s/^$1=\([0-9]*\)$/\1/p" "$STATE_FILE" | tail -n1
}

state_put() { printf 'down_since=%s\npaged=%s\n' "$1" "$2" > "$STATE_FILE"; }

# The dark message. What happened first, because that is the fact. What is
# stopped second, because "the control plane is down" means nothing on its own.
# The action last, because it is two things to look at.
format_dark() {
  local elapsed=$1 since_epoch=$2 since
  since=$(at_epoch "$since_epoch" '%H:%M %Z')
  printf 'Fleet is dark. The control plane on zero stopped answering %s ago, at %s. ' \
    "$(fmt_duration "$elapsed")" "$since"
  printf 'Nothing is running: no agent runs, no routines, no store watch. Every other watch lives on that same Mac, so none of them can tell you either. '
  printf 'Check the laptop: power first, then the FileVault prompt.'
}

# The recovery message, and the reason this script is worth more than a louder
# battery warning. This is the line that would have made LAC-4874 unnecessary.
format_back() {
  local dark_for=$1 back_at_epoch=$2 back_at
  back_at=$(at_epoch "$back_at_epoch" '%H:%M %Z')
  printf 'Fleet is back. The control plane answered again at %s, after %s dark. Anything scheduled in that window did not run.' \
    "$back_at" "$(fmt_duration "$dark_for")"
}

# Slack-DM one line. Returns non-zero and prints why rather than exiting, so a
# broken notifier still leaves the event in the log and the exit code honest. A
# monitor that goes quiet because its own notifier failed is the exact bug this
# file exists to prevent.
notify() {
  local text=$1 response token=$SLACK_TOKEN
  if [ -z "$token" ] && [ -r "$SLACK_TOKEN_FILE" ]; then
    token=$(tr -d ' \t\n\r' < "$SLACK_TOKEN_FILE")
  fi
  if [ -z "$token" ]; then
    printf 'no Slack token: set FLEET_DARK_WATCH_SLACK_TOKEN or put one in %s\n' \
      "$SLACK_TOKEN_FILE" >&2
    return 1
  fi
  response=$(curl -sS -m 15 -X POST https://slack.com/api/chat.postMessage \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data "$(jq -n --arg c "$SLACK_CHANNEL" --arg t "$text" '{channel:$c,text:$t}')" 2>&1)
  if printf '%s' "$response" | jq -e '.ok == true' >/dev/null 2>&1; then
    printf '%s' "$response"
    return 0
  fi
  printf 'Slack rejected the message: %s\n' "$response" >&2
  return 1
}

# --- the check -------------------------------------------------------------

# Dependencies before anything else, and exit 2 rather than 0. Without curl
# there is no check and no way to report that there is no check.
for dep in curl jq date; do
  command -v "$dep" >/dev/null 2>&1 || { printf 'fleet-dark-watch needs %s and it is not on PATH\n' "$dep" >&2; exit 2; }
done

if ! mkdir -p "$WATCH_DIR" 2>/dev/null || ! [ -w "$WATCH_DIR" ]; then
  printf 'fleet-dark-watch cannot write to %s, so it cannot tell one outage from twelve hours of them\n' "$WATCH_DIR" >&2
  exit 2
fi

# There is deliberately no lock here. A cycle costs at most 25 seconds against a
# 300 second interval, so two copies would have to overlap by a factor of twelve;
# and if they ever did, the worst a torn state file causes is one duplicate page,
# because `state_get` only matches a complete numeric line and an incomplete one
# reads as "no outage recorded". A stuck lock, by contrast, would silence this
# watch permanently. For a dead-man's switch that trade is not close.
NOW=$(now)
BODY=$(mktemp); CURL_ERR=$(mktemp); trap 'rm -f "$BODY" "$CURL_ERR"' EXIT
HTTP=$(curl -sS -m "$CURL_TIMEOUT" -o "$BODY" -w '%{http_code}' \
  --resolve "${HEALTH_HOST}:443:${HEALTH_IP}" "$HEALTH_URL" 2>"$CURL_ERR")
# On a connection failure curl writes its own `000` and *also* exits non-zero,
# so a `|| printf 000` fallback here logs `http=000000`. Normalising instead
# keeps one spelling for "no answer" whatever shape the failure took.
case "$HTTP" in
  [0-9][0-9][0-9]) ;;
  *) HTTP=000 ;;
esac
# Kept because http=000 and `TLS connect error` both look like a firewall and
# neither one is. Whoever reads this log next should not have to re-derive that.
WHY=$(tr -d '\r' < "$CURL_ERR" | tr '\n' ' ' | sed 's/  */ /g; s/ *$//')

# Answering means a 200 carrying the health JSON. A 200 of something else is a
# captive portal or a proxy, not the control plane.
ALIVE=0
STARTED_AT=""
if [ "$HTTP" = "200" ] && jq -e '.status' "$BODY" >/dev/null 2>&1; then
  ALIVE=1
  STARTED_AT=$(jq -r '.serverInfo.processStartedAt // empty' "$BODY" 2>/dev/null)
fi

DOWN_SINCE=$(state_get down_since)
PAGED=$(state_get paged)
: "${DOWN_SINCE:=}" "${PAGED:=0}"

if [ "$ALIVE" = "1" ]; then
  if [ -n "$DOWN_SINCE" ]; then
    # The plane came back. processStartedAt is when it actually started
    # answering, which is more honest than when this poll happened to notice:
    # between those two is up to five minutes of cron, not of outage.
    BACK_AT=$NOW
    if [ -n "$STARTED_AT" ]; then
      parsed=$(iso_epoch "$STARTED_AT")
      # Only trust it if it falls inside the outage. A process that started
      # before the outage began never restarted, so the network was the problem
      # and this poll is the first moment anyone can prove it is back.
      if [ -n "$parsed" ] && [ "$parsed" -ge "$DOWN_SINCE" ] && [ "$parsed" -le "$NOW" ]; then
        BACK_AT=$parsed
      fi
    fi
    DARK_FOR=$((BACK_AT - DOWN_SINCE))
    if [ "$PAGED" = "1" ]; then
      message=$(format_back "$DARK_FOR" "$BACK_AT")
      log "RECOVERED $message"
      if [ "$NOTIFY" = "1" ]; then notify "$message" || log "NOTIFY-FAILED recovery message not delivered"; fi
    else
      # Down for less than the threshold and back again. A restart, not an
      # outage. It belongs in the log and nowhere else.
      log "BLIP plane was unreachable for $(fmt_duration "$DARK_FOR") and recovered before the $(fmt_duration "$DARK_AFTER_SECONDS") threshold"
    fi
    rm -f "$STATE_FILE"
  else
    log "OK plane answered 200, up since ${STARTED_AT:-unknown}"
  fi
  exit 0
fi

# Not answering. First failure starts the clock; it does not page.
if [ -z "$DOWN_SINCE" ]; then
  DOWN_SINCE=$NOW
  state_put "$DOWN_SINCE" 0
  log "UNREACHABLE http=$HTTP ${WHY:-no curl error}, starting the clock, paging if this lasts $(fmt_duration "$DARK_AFTER_SECONDS")"
  exit 1
fi

ELAPSED=$((NOW - DOWN_SINCE))
if [ "$PAGED" = "1" ]; then
  log "STILL-DARK http=$HTTP for $(fmt_duration "$ELAPSED"), already paged"
  exit 1
fi

if [ "$ELAPSED" -lt "$DARK_AFTER_SECONDS" ]; then
  log "UNREACHABLE http=$HTTP ${WHY:-no curl error} for $(fmt_duration "$ELAPSED"), under the $(fmt_duration "$DARK_AFTER_SECONDS") threshold"
  exit 1
fi

message=$(format_dark "$ELAPSED" "$DOWN_SINCE")
log "DARK $message"
if [ "$NOTIFY" = "1" ]; then
  if notify "$message"; then
    # Written only on a delivered DM, so a Slack outage retries in five minutes
    # instead of silently spending the one page this outage was owed.
    state_put "$DOWN_SINCE" 1
  else
    log "NOTIFY-FAILED dark message not delivered, will retry next cycle"
  fi
fi
# Without --notify the state file is left alone on purpose: running this by hand
# must never spend the page the real outage is owed. Same contract as the power
# watch, which also only records a warning it actually delivered.
exit 1
