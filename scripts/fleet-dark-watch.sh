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
# The switch worked and the channel did not (LAC-5366). Over its first five days
# it caught all eight dark windows, 22h25m of real dark time, and two of those
# windows account for 18h45m of it: paged at 03:05 and at 00:30, recovered at
# 11:30 and 10:20, both times by a human plugging the laptop in. The page was
# right, the fix was ten seconds, and nobody saw it until morning because Slack
# suppresses push during Do Not Disturb. So it now sends on two channels.
#
# Usage:
#   fleet-dark-watch.sh              # poll and log, print what it would send
#   fleet-dark-watch.sh --notify     # poll, log, and send for real
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

# The name a human reads at 2am. Derived from the host already configured above,
# never its own variable: a sixth env var on the cron line is one an operator can
# forget, and a page naming the wrong machine is the whole defect this avoids.
# A second instance of this script watching graphite says graphite everywhere.
HEALTH_LABEL="${HEALTH_HOST%%.*}"

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
PRIMARY_DIR="${FLEET_DARK_WATCH_DIR:-/mnt/cachex/appdata/fleet-dark-watch}"

# Where state goes when the pool will not take it. Unraid's /tmp is RAM, so it
# survives the realistic failure here: that 932G pool is at 91%, and one large
# download closes the gap. State in RAM is lost on reboot, which costs at most
# one duplicate page; state nowhere at all costs every page of the outage,
# because a state write that fails leaves the next poll re-reading "no outage
# recorded", restarting the clock, and never reaching the threshold.
FALLBACK_DIR="${FLEET_DARK_WATCH_FALLBACK_DIR:-/tmp/fleet-dark-watch}"

# Resolved below once the directories have been tried for real. WATCH_DIR is
# whichever one actually accepted a write.
WATCH_DIR="$PRIMARY_DIR"
DEGRADED=""

# Who hears about it. Lacy's Slack DM, the same channel the power watch and the
# stranded-work watch already use, because an alert in a channel nobody reads is
# the failure this issue is about. Kept in one function so swapping the channel
# is a one-line change once Lacy names the one that should wake him at 23:30.
SLACK_CHANNEL="${FLEET_DARK_WATCH_SLACK_CHANNEL:-U3XC80UUQ}"
SLACK_TOKEN="${FLEET_DARK_WATCH_SLACK_TOKEN:-}"

# Overridable so the tests can point the notifier at a local server and assert
# on the bytes it actually sends.
SLACK_API_URL="${FLEET_DARK_WATCH_SLACK_API:-https://slack.com/api/chat.postMessage}"

# Falls back to a file so the cron line can stay clean. Unraid regenerates root's
# crontab onto /boot, which is FAT32 and carries no permission bits at all, so a
# token inlined there would be readable by anything that can see the flash. The
# pool is a real filesystem and can hold a 600.
#
# Pinned to PRIMARY_DIR, not WATCH_DIR: a full pool still reads fine, so the
# token stays exactly where it was installed even when state has fallen back to
# RAM. Deriving this from WATCH_DIR would make a full disk look like a missing
# token and take the notifier down with it.
SLACK_TOKEN_FILE="${FLEET_DARK_WATCH_SLACK_TOKEN_FILE:-$PRIMARY_DIR/slack-token}"

# --- the channel that survives Do Not Disturb (LAC-5366) -------------------
#
# Slack above is the readable log of what happened. This is the thing that wakes
# someone, and the two carry the same words on purpose: a pager that disagrees
# with the log is worse than either one alone.
#
# ntfy because it costs nothing to run and nothing to approve: no account, no
# money, no token. Its iOS and Android apps can be allowed through Do Not
# Disturb as a Critical Alert, which is the entire reason this exists.
#
# The topic IS the credential. A public ntfy topic is world-readable and
# world-writable by anyone who knows the name, so it is a long random string, it
# lives in a 600 file beside the Slack token, and it is never logged. Everything
# this script prints about ntfy goes through `redact_topic` for that reason: the
# URL contains the secret, and curl puts the URL in some of its own error text.
NTFY_BASE_URL="${FLEET_DARK_WATCH_NTFY_URL:-https://ntfy.sh}"
NTFY_TOPIC="${FLEET_DARK_WATCH_NTFY_TOPIC:-}"

# Pinned to PRIMARY_DIR for the same reason as SLACK_TOKEN_FILE: a full pool
# still reads fine, so a disk that has pushed state into RAM must not also look
# like a missing topic and take this channel down with it.
NTFY_TOPIC_FILE="${FLEET_DARK_WATCH_NTFY_TOPIC_FILE:-$PRIMARY_DIR/ntfy-topic}"

# 5 is ntfy's maximum. It is what the iOS app maps to a Critical Alert and what
# the Android app maps to a Do Not Disturb bypass. Anything lower makes the rest
# of this change pointless.
NTFY_PRIORITY="${FLEET_DARK_WATCH_NTFY_PRIORITY:-5}"

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

# Both are derived from WATCH_DIR only after the directory has been proven
# writable below, so a fallback moves the state and the log together. Nothing
# above that point may call `log` or `state_get`.
STATE_FILE=""
LOG_FILE=""

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

# Returns non-zero when the state could not be persisted. Every call site checks
# it. An unchecked state write is how this script turns its own pager off: the
# write fails, the next poll finds nothing, the clock restarts, and a twelve-hour
# outage produces zero pages and no log line saying why.
#
# `recovered_at` is only present between measuring a recovery and delivering it,
# so a retry reports the duration that was measured rather than one inflated by
# however long the notifier was broken.
state_put() {
  local down_since=$1 paged=$2 recovered_at=${3:-} payload
  payload=$(printf 'down_since=%s\npaged=%s' "$down_since" "$paged")
  if [ -n "$recovered_at" ]; then
    payload=$(printf '%s\nrecovered_at=%s' "$payload" "$recovered_at")
  fi
  printf '%s\n' "$payload" > "$STATE_FILE" 2>/dev/null
}

# The lock-screen glance. ntfy renders the title above the body, so these are
# the words Lacy reads at 00:30 before he has picked the phone up. They are also
# the first words of each message below, deliberately: the title on the phone
# and the sentence in Slack must not say different things about the same event.
DARK_TITLE="Fleet is dark on ${HEALTH_LABEL}"
BACK_TITLE="Fleet is back on ${HEALTH_LABEL}"

# The dark message. What happened first, because that is the fact. What is
# stopped second, because "the control plane is down" means nothing on its own.
# The action last, because it is two things to look at.
format_dark() {
  local elapsed=$1 since_epoch=$2 since
  since=$(at_epoch "$since_epoch" '%H:%M %Z')
  printf 'Fleet is dark. The control plane on %s stopped answering %s ago, at %s. ' \
    "$HEALTH_LABEL" "$(fmt_duration "$elapsed")" "$since"
  # What is stopped is host-specific, not a wording difference. zero holds the
  # agent runs, the routines, the store watch and every other watch, so its page
  # is the only notice that can arrive. graphite holds none of those: 6 of
  # zero's watches are absent there and it has no crontab, so claiming nothing
  # can reach him would be false.
  case "$HEALTH_LABEL" in
    zero) printf 'Nothing is running: no agent runs, no routines, no store watch. This is your only notice; every other watch runs on zero too. ' ;;
    *) printf 'Nothing on %s is running: no agent runs, no routines. ' "$HEALTH_LABEL" ;;
  esac
  # "any login prompt" rather than FileVault: FileVault is On on zero and Off on
  # graphite, and this survives a flip on either.
  printf 'Check %s: power first, then any login prompt.' "$HEALTH_LABEL"
}

# The recovery message, and the reason this script is worth more than a louder
# battery warning. This is the line that would have made LAC-4874 unnecessary.
format_back() {
  local dark_for=$1 back_at_epoch=$2 back_at
  back_at=$(at_epoch "$back_at_epoch" '%H:%M %Z')
  printf 'Fleet is back. The control plane on %s answered again at %s, after %s dark. Anything scheduled in that window did not run.' \
    "$HEALTH_LABEL" "$back_at" "$(fmt_duration "$dark_for")"
}

# Slack-DM one line. Returns non-zero and prints why rather than exiting, so a
# broken notifier still leaves the event in the log and the exit code honest. A
# monitor that goes quiet because its own notifier failed is the exact bug this
# file exists to prevent.
#
# Named for its channel since LAC-5366 added a second one. `notify` below is the
# fan-out and is what every call site uses.
#
# Deliberately free of `jq`. jq is required to read the health body, but it must
# not be required to raise the alarm: "jq is missing" is itself one of the things
# this script has to be able to say, and a notifier that needs the missing tool
# to report the missing tool reports nothing.
#
# A JSON string needs exactly three things escaped: backslash, double quote, and
# control characters. Backslash first, or it would double-escape the quotes it
# just introduced. Every control byte is flattened to a space, not just the
# three a message is likely to contain: a raw \x1b would otherwise produce
# invalid JSON, Slack would reject it, and the rejection would eat the page.
# `[:cntrl:]` rather than a hand-listed set, so this stays true of bytes nobody
# thought about (LAC-4875 nit 1).
json_string() {
  printf '%s' "$1" | tr '[:cntrl:]' ' ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

notify_slack() {
  local text=$1 response token=$SLACK_TOKEN
  if [ -z "$token" ] && [ -r "$SLACK_TOKEN_FILE" ]; then
    token=$(tr -d ' \t\n\r' < "$SLACK_TOKEN_FILE")
  fi
  if [ -z "$token" ]; then
    printf 'no Slack token: set FLEET_DARK_WATCH_SLACK_TOKEN or put one in %s\n' \
      "$SLACK_TOKEN_FILE" >&2
    return 1
  fi
  response=$(curl -sS -m 15 -X POST "$SLACK_API_URL" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data "{\"channel\":\"$(json_string "$SLACK_CHANNEL")\",\"text\":\"$(json_string "$text")\"}" 2>&1)
  if printf '%s' "$response" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
    printf '%s' "$response"
    return 0
  fi
  printf 'Slack rejected the message: %s\n' "$response" >&2
  return 1
}

# The topic is the credential and the topic is in the URL, so anything printed
# about ntfy is scrubbed before it reaches stderr or the log. curl writes the URL
# it failed on into several of its own error strings, which is how a 600 file
# would otherwise end up in /tmp/fleet-dark-watch.err in plain text.
#
# A no-op while the topic is unset, because an empty pattern would otherwise
# have sed insert the placeholder between every character of the message.
redact_topic() {
  if [ -z "$NTFY_TOPIC" ]; then cat; else sed "s|$NTFY_TOPIC|<topic>|g"; fi
}

# Resolved into the global rather than kept local, because `redact_topic` has to
# know the string to be able to scrub it. Returns non-zero when there is no
# topic anywhere, which is "this channel is not configured", not an error on its
# own: Slack is still a channel and the caller still has a page to deliver.
resolve_ntfy_topic() {
  if [ -z "$NTFY_TOPIC" ] && [ -r "$NTFY_TOPIC_FILE" ]; then
    NTFY_TOPIC=$(tr -d ' \t\n\r' < "$NTFY_TOPIC_FILE")
  fi
  [ -n "$NTFY_TOPIC" ]
}

# A header value cannot carry a newline or a carriage return: either one ends the
# header early and the rest of the string becomes a forged header or a torn
# request. Flattened with the same `[:cntrl:]` class `json_string` uses, so both
# channels stay honest about bytes nobody thought about.
header_value() { printf '%s' "$1" | tr '[:cntrl:]' ' '; }

# Push one line to ntfy, at a priority its app treats as a Critical Alert. Same
# contract as notify_slack: returns non-zero and prints why rather than exiting.
#
# The title rides in a header and the message is the raw request body, so this
# needs no JSON at all and no quote in a message can break the payload. The body
# goes in on stdin via `@-` rather than as an argument, because `--data-binary`
# reads a file when its argument starts with `@` and a message is not a thing
# that should be able to open files.
#
# Success is the HTTP status, not a word in the body. `-w` prints last, so the
# status is the tail of the captured text whatever shape the failure took, and a
# connection failure writes its own `000` there the same way the main poll's
# does.
notify_ntfy() {
  local text=$1 title=$2 tags=$3 response
  if ! resolve_ntfy_topic; then
    printf 'no ntfy topic: set FLEET_DARK_WATCH_NTFY_TOPIC or put one in %s\n' \
      "$NTFY_TOPIC_FILE" >&2
    return 1
  fi
  response=$(printf '%s' "$text" | curl -sS -m 15 -w ' http=%{http_code}' \
    -H "Title: $(header_value "$title")" \
    -H "Priority: $(header_value "$NTFY_PRIORITY")" \
    -H "Tags: $(header_value "$tags")" \
    --data-binary @- "$NTFY_BASE_URL/$NTFY_TOPIC" 2>&1 | redact_topic)
  case "$response" in
    *'http=200')
      printf '%s' "$response"
      return 0
      ;;
  esac
  printf 'ntfy rejected the message: %s\n' "$response" >&2
  return 1
}

# Both channels, one message, one event. Every call site uses this.
#
# Delivered means at least one channel accepted it, and the callers read that
# return value to decide whether the page has been spent. Both alternatives are
# worse. Requiring both would re-send to the phone every five minutes for the
# whole outage whenever Slack is the broken half, which is the muted-channel
# failure this file keeps trying not to cause. Requiring neither would mark a
# page delivered that nobody received.
#
# Sets NOTIFY_OUTCOME so the log can say which channel did what. That line is
# the only place a half-delivered page is visible: the delivered half hands the
# caller a success, and the failed half only reaches stderr, which the cron line
# throws away.
NOTIFY_OUTCOME=""
notify() {
  local text=$1 title=$2 tags=$3 slack=failed ntfy=failed
  if notify_slack "$text" >/dev/null; then slack=ok; fi
  if notify_ntfy "$text" "$title" "$tags" >/dev/null; then ntfy=ok; fi
  NOTIFY_OUTCOME="slack=$slack ntfy=$ntfy"
  [ "$slack" = ok ] || [ "$ntfy" = ok ]
}

# The alarm for when this script cannot do its job. Goes to Slack, not only to
# stderr, because the shipped cron line cannot keep stderr: a `2>&1` into
# /dev/null made exit 2 produce literally nothing, and silence is also what a
# healthy fleet looks like. When the watch dir is the broken thing the log is on
# it too, so the channel is the only place left that works.
#
# Slack only, on purpose. This one is already rate-limited to once an hour
# because it has no state file to dedupe against, it persists until a human
# fixes it, and it fires while the fleet itself may be perfectly healthy. A
# Critical Alert that can arrive 24 times in a night for a condition that is not
# an outage is how the channel gets switched off, and a switched-off channel is
# the thing LAC-5366 exists to fix. DARK and RECOVERED are the only two events
# worth waking someone for.
cannot_look() {
  local reason=$1
  printf 'fleet-dark-watch cannot do its job: %s\n' "$reason" >&2
  if [ "$NOTIFY" = "1" ]; then
    notify_slack "Fleet dark watch is blind on library: $reason. It is not watching anything until this is fixed, so treat silence from it as meaningless." >/dev/null \
      || printf 'and could not report it to Slack either\n' >&2
  fi
}

# One Slack message an hour, without a state file to dedupe against, for the one
# failure where there is nowhere to keep state. A 5-minute cron crosses the top
# of the hour exactly once, so this is 24 messages a day rather than 288. Plain
# stderr is never gated: a human running this by hand must always see it.
#
# Reads the injected clock rather than the wall clock, so this is the same
# moment the rest of the poll is reasoning about and the tests can stand on
# either side of the boundary.
#
# Fails *open*. Working out the minute needs `date`, and `date` is one of the
# dependencies whose absence this gate is asked about, so a missing clock must
# mean "speak", never "stay silent". A flood is a bad outcome; silence is the
# failure this whole file exists to prevent.
top_of_hour() {
  local minute
  minute=$(at_epoch "$(now)" %M 2>/dev/null | sed 's/^0*//')
  case "$minute" in
    "") return 0 ;;
    *[!0-9]*) return 0 ;;
  esac
  [ "$minute" -lt 5 ]
}

# --- the check -------------------------------------------------------------

# Dependencies before anything else, and exit 2 rather than 0. Without curl
# there is no check and no way to report that there is no check.
for dep in curl jq date; do
  command -v "$dep" >/dev/null 2>&1 || {
    # Reported through the channel, not just stderr. curl is what the notifier
    # needs, so losing jq or date still leaves a way to say so; losing curl
    # leaves none, and stderr is all there is.
    #
    # Rate-limited like the nowhere-to-write path below, and for the same
    # reason: a missing dependency persists until a human fixes it, so an
    # ungated DM here is 288 a day and a muted channel (LAC-4875 nit 2). stderr
    # is never gated, so a by-hand run always says it.
    printf 'fleet-dark-watch needs %s and it is not on PATH\n' "$dep" >&2
    if top_of_hour; then cannot_look "$dep is not on PATH"; fi
    exit 2
  }
done

# Proves the directory by writing to it. `[ -w ]` answers a question nobody
# asked: it tests the permission bits, and the failure that actually threatens
# this host is free space. /mnt/user/appdata already refuses every write with
# ENOSPC while df reports 88G free, because the share's shareFloor sits above
# the pool's free space, and root does not bypass a full filesystem either.
can_write() {
  local dir=$1 probe
  mkdir -p "$dir" 2>/dev/null || return 1
  probe="$dir/.probe.$$"
  printf 'x' > "$probe" 2>/dev/null || { rm -f "$probe" 2>/dev/null; return 1; }
  rm -f "$probe" 2>/dev/null
  return 0
}

if can_write "$PRIMARY_DIR"; then
  WATCH_DIR="$PRIMARY_DIR"
elif can_write "$FALLBACK_DIR"; then
  WATCH_DIR="$FALLBACK_DIR"
  DEGRADED="state is in $FALLBACK_DIR because $PRIMARY_DIR would not take a write"
  printf 'fleet-dark-watch: %s\n' "$DEGRADED" >&2
else
  # Nowhere to keep state means no dedupe, so this is the one path that cannot
  # rate-limit itself with a file. Still better than exiting 0 and looking fine.
  printf 'fleet-dark-watch cannot write to %s or %s, so it cannot tell one outage from twelve hours of them\n' \
    "$PRIMARY_DIR" "$FALLBACK_DIR" >&2
  if top_of_hour; then
    cannot_look "it cannot write to $PRIMARY_DIR or $FALLBACK_DIR, so it cannot tell one outage from twelve hours of them"
  fi
  exit 2
fi

STATE_FILE="$WATCH_DIR/state"
LOG_FILE="$WATCH_DIR/fleet-dark-watch.log"

# A missing topic leaves the DND channel off while everything else still works,
# so the next overnight page would land in Slack alone and nobody would know
# until morning. That is the exact failure LAC-5366 was filed about, so it is
# reported the same way a fallback state dir is: appended to DEGRADED, which the
# healthy-path OK line carries. Checked here rather than at page time because by
# then the information is six hours late.
#
# The log and not Slack, on purpose. This is a persistent configuration fault,
# the watch is still watching, and a page still reaches one channel; nagging the
# pager hourly about its own configuration is how the pager gets muted. The
# per-page `SENT slack=... ntfy=...` line says the same thing at the moment it
# costs something.
if ! resolve_ntfy_topic; then
  DEGRADED="${DEGRADED:+$DEGRADED; }no ntfy topic in $NTFY_TOPIC_FILE, so pages go to Slack only and will not survive Do Not Disturb"
  printf 'fleet-dark-watch: %s\n' "$DEGRADED" >&2
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
RECOVERED_AT=$(state_get recovered_at)
: "${DOWN_SINCE:=}" "${PAGED:=0}" "${RECOVERED_AT:=}"

if [ "$ALIVE" = "1" ]; then
  if [ -n "$DOWN_SINCE" ]; then
    # The plane came back. processStartedAt is when it actually started
    # answering, which is more honest than when this poll happened to notice:
    # between those two is up to five minutes of cron, not of outage.
    BACK_AT=$NOW
    if [ -n "$RECOVERED_AT" ]; then
      # An earlier poll already measured this recovery and failed to deliver it.
      # That number is the honest one. Recomputing would quietly add however
      # long the notifier stayed broken to the reported outage.
      BACK_AT=$RECOVERED_AT
    elif [ -n "$STARTED_AT" ]; then
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
      if [ "$NOTIFY" = "1" ]; then
        if notify "$message" "$BACK_TITLE" white_check_mark; then
          log "SENT $NOTIFY_OUTCOME"
          rm -f "$STATE_FILE"
        else
          # The outage is over and unreported, and an unreported recovery is the
          # message this whole file exists to produce. Keep the state so the
          # next poll retries, and pin the moment it came back so the retry
          # reports the duration that was measured. Clearing here instead is how
          # one transient Slack failure used to eat the headline number for good.
          log "NOTIFY-FAILED recovery message not delivered on any channel ($NOTIFY_OUTCOME), keeping the outage open so the next poll retries"
          state_put "$DOWN_SINCE" 1 "$BACK_AT" \
            || cannot_look "it measured a ${DARK_FOR}s outage, could not deliver it, and could not write $STATE_FILE to retry"
        fi
      fi
      # A dry run deliberately leaves the state alone: it must not consume the
      # recovery message the next real poll still owes.
    else
      # Down for less than the threshold and back again. A restart, not an
      # outage. It belongs in the log and nowhere else.
      #
      # This line used to claim it "recovered before the 15m threshold", and on
      # 2026-10-23T20:10:01 it printed "unreachable for 15m and recovered before
      # the 15m threshold", which cannot be true as a sentence. Neither number
      # was wrong. They are measured at different moments: the page is decided
      # at a *failing* poll, and this duration runs to the recovery, which is up
      # to one cron interval later. The 19:55:01 poll started the clock, 20:05
      # saw 10m and held, 20:10:01 found it back, so the outage really did last
      # 15m and really was never paged. What it beat was the next failing poll,
      # not the threshold, and that is what the line now says.
      log "BLIP plane was unreachable for $(fmt_duration "$DARK_FOR") and answered again before any poll caught it past the $(fmt_duration "$DARK_AFTER_SECONDS") threshold, so nobody was paged"
      rm -f "$STATE_FILE"
    fi
  else
    log "OK plane answered 200, up since ${STARTED_AT:-unknown}${DEGRADED:+ (degraded: $DEGRADED)}"
  fi
  exit 0
fi

# Not answering. First failure starts the clock; it does not page.
if [ -z "$DOWN_SINCE" ]; then
  DOWN_SINCE=$NOW
  if state_put "$DOWN_SINCE" 0; then
    log "UNREACHABLE http=$HTTP ${WHY:-no curl error}, starting the clock, paging if this lasts $(fmt_duration "$DARK_AFTER_SECONDS")"
  else
    # The clock cannot be started, so no later poll will ever reach the
    # threshold. Page now instead: the plane is unreachable and the only thing
    # that could have reported that properly is broken, and both facts matter.
    log "UNREACHABLE http=$HTTP ${WHY:-no curl error}, and $STATE_FILE could not be written"
    cannot_look "the plane is unreachable and it cannot write $STATE_FILE, so it cannot time the outage"
  fi
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
  if notify "$message" "$DARK_TITLE" rotating_light; then
    log "SENT $NOTIFY_OUTCOME"
    # Written only on a delivered page, so a notifier outage retries in five
    # minutes instead of silently spending the one page this outage was owed. If
    # that write fails the page was still delivered, so the only cost is a repeat
    # on the next poll. Logged rather than escalated, because repeating a true
    # page is the harmless direction of this failure.
    state_put "$DOWN_SINCE" 1 \
      || log "STATE-WRITE-FAILED page delivered but $STATE_FILE could not record it, so it will repeat next poll"
  else
    log "NOTIFY-FAILED dark message not delivered on any channel ($NOTIFY_OUTCOME), will retry next cycle"
  fi
fi
# Without --notify the state file is left alone on purpose: running this by hand
# must never spend the page the real outage is owed. Same contract as the power
# watch, which also only records a warning it actually delivered.
exit 1
