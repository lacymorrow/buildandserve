#!/usr/bin/env bash
#
# Puts zero's own network back when it drops, so the fleet stops going dark
# (LAC-5275).
#
# PAPERCLIP_API_URL is https://zero.hyrax-boga.ts.net, which is this laptop's
# own tailnet name. When Tailscale here stops, the laptop cannot reach itself,
# every agent write fails, and nothing recovers on its own. Overnight
# 2026-10-20/21 that cost about six hours and stranded two finished
# deliverables as local files, with the control plane answering on loopback the
# whole time.
#
# ## Health is "can this host resolve a public name", not "is Tailscale running"
#
# The first version of this watched BackendState. It would have been useless.
# On 2026-10-21 the CTO brought Tailscale back up by hand and the fleet was
# still broken: ts.net resolved again, and every npm, GitHub and Vercel call
# still failed, because the host's only system nameserver was 10.0.0.243 on a
# network this laptop had left. Tailscale pushes no resolver of its own (see
# `tailscale dns status`: "no resolvers configured, system default will be
# used"), only a ts.net split route, so MagicDNS forwards every public name to
# that dead nameserver. Tailscale running or stopped, public DNS was dead
# either way. A watchdog that reported success there would have been worse than
# nothing.
#
# So there are two independent faults and the probe has to be able to tell them
# apart:
#
#   1. Tailscale stopped      -> ts.net dies, public DNS may be fine.
#   2. System resolver dead   -> public DNS dies, ts.net stays fine.
#
# ## Why the probes are HTTP and not name lookups
#
# Both probes are a real request to a real remote host, through getaddrinfo,
# which is the path npm, git, curl and node actually use. A 200 from a host
# across the internet cannot be served out of a cache, and that matters here:
# `npm view` with DNS down serves its offline cache with exit code 0 and no
# warning, which is how two runs a minute apart reported different "live"
# versions on 2026-10-21. Anything with a cache fails open, and a watchdog that
# fails open is a watchdog that lies.
#
# `dig` appears in this file exactly once, and never to declare health: it is
# used to attribute a failure, by asking a resolver we name by IP whether the
# fault is our resolver config or the link itself.
#
# ## What it will and will not touch
#
# It repairs only the two unambiguous shapes. `LoggedOut: true` or a non-empty
# `AuthURL` means a human has to sign in, so it does not touch those and pages
# instead. A public-DNS failure where 1.1.1.1 is *also* silent is the link or
# the gateway, not the resolver config, so it changes nothing and pages: that is
# the case where rewriting DNS would be a wrong repair on a flapping network.
#
# Usage:
#   tailscale-watchdog.sh                     # probe and log, print what it would do
#   tailscale-watchdog.sh --repair            # probe, log, repair for real
#   tailscale-watchdog.sh --repair --notify   # and Slack-DM Lacy when it matters
#
# Exit codes: 0 = the host is healthy (possibly after a repair this run), 1 = it
# is not, 2 = this script could not do its job (missing dependency, nowhere to
# write). 2 is never reported as 0, for the same reason the dead-man's switch
# keeps them apart: "could not look" and "the fleet is fine" are different
# readings and only one of them is good news.

set -uo pipefail

# launchd hands a job almost no PATH, and this must not fail for a reason that
# boring. /usr/local/bin is where the Tailscale CLI wrapper lives, /opt/homebrew
# is jq, and /usr/sbin is networksetup.
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# --- what it probes --------------------------------------------------------

# The control plane over its real tailnet URL, with no --resolve pinning, on
# purpose. Pinning the address would prove TCP works and hide the MagicDNS
# failure, which is the thing that takes the fleet down. This is the exact
# request every agent makes.
PLANE_URL="${TS_WATCHDOG_PLANE_URL:-https://zero.hyrax-boga.ts.net/api/health}"

# Something outside the tailnet, because that is the half of health that
# survived the last repair and still left the fleet broken. npm's own ping
# endpoint is a small 200 and npm is the dependency that fails first.
PUBLIC_URL="${TS_WATCHDOG_PUBLIC_URL:-https://registry.npmjs.org/-/ping}"

# Used only to attribute a public-DNS failure, never to declare health. A
# resolver addressed by IP needs no DNS to reach, which is the point.
PUBLIC_RESOLVER="${TS_WATCHDOG_PUBLIC_RESOLVER:-1.1.1.1}"
PUBLIC_CANARY="${TS_WATCHDOG_PUBLIC_CANARY:-registry.npmjs.org}"

# Long enough for a loaded laptop, short enough that two probes plus a repair
# cannot still be running when launchd starts the next cycle.
TIMEOUT="${TS_WATCHDOG_TIMEOUT:-8}"

# The resolvers rung 2 installs. Two providers rather than one so a single
# provider outage is not a fleet outage.
DNS_SERVERS="${TS_WATCHDOG_DNS_SERVERS:-1.1.1.1 8.8.8.8}"

# How long the host must stay broken before Lacy hears about it. Three cycles at
# the installed 5-minute interval. Short enough to matter overnight, long enough
# that a wifi roam or a lid close does not page anybody. Same threshold as the
# LAC-4874 dead-man's switch, so the two cannot disagree about what counts as an
# outage.
PAGE_AFTER="${TS_WATCHDOG_PAGE_AFTER:-900}"

# Give up after this many consecutive repair attempts that did not fix it. The
# 2026-10-21 wedge was real: `tailscale up` returned and the network extension
# stayed in NoState, and no number of retries was going to change that. A
# watchdog that keeps trying forever is a watchdog nobody can read the log of.
MAX_ATTEMPTS="${TS_WATCHDOG_MAX_ATTEMPTS:-3}"

# Floor between two repair attempts, so a flapping node cannot be flapped harder
# by us. Below the installed interval, so it never blocks normal operation, but
# it does stop a RunAtLoad burst or a hand-run loop from hammering the only
# network path the fleet has.
MIN_REPAIR_GAP="${TS_WATCHDOG_MIN_REPAIR_GAP:-240}"

# A second, slower cap for the case the attempt counter cannot see: repairs that
# *work*, over and over. Each success resets the attempt counter, so without
# this a node that breaks every six minutes would be repaired forever in
# silence. More than this many repairs in the window and it stops repairing and
# says so.
REPAIR_WINDOW="${TS_WATCHDOG_REPAIR_WINDOW:-3600}"
MAX_REPAIRS_PER_WINDOW="${TS_WATCHDOG_MAX_REPAIRS_PER_WINDOW:-6}"

# How long Tailscale gets to settle after `tailscale up` before the re-probe.
# Routes and DNS land a beat after the command returns, and re-probing instantly
# would read a successful repair as a failed one.
SETTLE="${TS_WATCHDOG_SETTLE:-3}"

# Quiet period between two "I fixed something" notices, so a bad afternoon is a
# couple of messages rather than a channel nobody reads. The page path is
# separate and is not rate-limited by this.
NOTICE_GAP="${TS_WATCHDOG_NOTICE_GAP:-21600}"

# --- the tools it drives ---------------------------------------------------
#
# Every external command is overridable, so the tests can point them at fakes
# and exercise the real branches without a real Tailscale, a real resolver or a
# real network.
TAILSCALE="${TS_WATCHDOG_TAILSCALE:-/usr/local/bin/tailscale}"
NETWORKSETUP="${TS_WATCHDOG_NETWORKSETUP:-/usr/sbin/networksetup}"
DIG="${TS_WATCHDOG_DIG:-/usr/bin/dig}"
ROUTE="${TS_WATCHDOG_ROUTE:-/sbin/route}"

# --- where it keeps state --------------------------------------------------

# Under ~/.paperclip/logs' sibling directory, where every other fleet watch on
# this host keeps its state, so there is one place to look.
PRIMARY_DIR="${TS_WATCHDOG_DIR:-$HOME/.paperclip/tailscale-watchdog}"

# A full disk must not switch the pager off. This is the known silent-watchdog
# failure mode and it is in the acceptance criteria: an unchecked state write
# plus a full disk means the clock restarts every cycle, the threshold is never
# reached, and a twelve-hour outage produces zero pages. /tmp is the fallback
# and losing state on reboot costs at most one duplicate message.
FALLBACK_DIR="${TS_WATCHDOG_FALLBACK_DIR:-/tmp/tailscale-watchdog}"

WATCH_DIR="$PRIMARY_DIR"
DEGRADED=""
STATE_FILE=""
LOG_FILE=""
OVERRIDE_FILE=""
# The last cycle that found the host healthy. Its own file rather than a key in
# the state file, because the state file exists only during an outage and this
# has to survive the healthy stretch in between.
LAST_OK_FILE=""

# --- who hears about it ----------------------------------------------------
#
# Lacy's Slack DM, the same channel the dead-man's switch and the power watch
# already use. Deliberately not a second notifier: one place to look was the
# point of LAC-4874 and inventing another would undo it.
SLACK_CHANNEL="${TS_WATCHDOG_SLACK_CHANNEL:-U3XC80UUQ}"
SLACK_TOKEN="${TS_WATCHDOG_SLACK_TOKEN:-}"
SLACK_TOKEN_FILE="${TS_WATCHDOG_SLACK_TOKEN_FILE:-$HOME/.openclaw/openclaw.json}"
SLACK_API_URL="${TS_WATCHDOG_SLACK_API:-https://slack.com/api/chat.postMessage}"

REPAIR=0
NOTIFY=0
for arg in "$@"; do
  case "$arg" in
    --repair) REPAIR=1 ;;
    --notify) NOTIFY=1 ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

# Overridable so the tests can stand at a chosen moment instead of waiting out a
# fifteen-minute threshold or a one-hour repair window.
now() { printf '%s' "${TS_WATCHDOG_NOW:-$(date +%s)}"; }

# GNU date and BSD date spell "format this epoch" differently. Both forms are
# here so the file reads the same on the Mac it ships on and anywhere its tests
# are run.
at_epoch() { date -d "@$1" +"$2" 2>/dev/null || date -r "$1" +"$2"; }

log() {
  printf '%s %s\n' "$(at_epoch "$(now)" %Y-%m-%dT%H:%M:%S%z)" "$1" | tee -a "$LOG_FILE"
}

fmt_duration() {
  local total=$1 d h m
  d=$((total / 86400)); h=$(((total % 86400) / 3600)); m=$(((total % 3600) / 60))
  if [ "$d" -gt 0 ]; then printf '%dd %dh %dm' "$d" "$h" "$m"
  elif [ "$h" -gt 0 ]; then printf '%dh%02dm' "$h" "$m"
  else printf '%dm' "$m"
  fi
}

# Read one numeric key without sourcing the file. Sourcing would execute
# whatever a half-written state file happens to contain, and an incomplete line
# has to read as absent rather than as garbage.
state_get() {
  [ -f "$STATE_FILE" ] || return 0
  sed -n "s/^$1=\([0-9]*\)$/\1/p" "$STATE_FILE" | tail -n1
}

# Returns non-zero when the state could not be persisted, and every call site
# checks it. This is the acceptance criterion about the silent-watchdog failure
# mode: an unchecked write here is how this script turns its own pager off.
state_put() {
  printf 'down_since=%s\npaged=%s\nattempts=%s\ngave_up=%s\nlast_repair=%s\nwindow_start=%s\nwindow_repairs=%s\nnotice_at=%s\nrecovered_at=%s\n' \
    "$DOWN_SINCE" "$PAGED" "$ATTEMPTS" "$GAVE_UP" "$LAST_REPAIR" \
    "$WINDOW_START" "$WINDOW_REPAIRS" "$NOTICE_AT" "$RECOVERED_AT" > "$STATE_FILE" 2>/dev/null
}

# Clearing the outage without clearing the rate caps.
#
# This file is two things at once: a clock for the current outage, and the
# memory the rate caps are built on. Deleting it on recovery, which is what the
# first version did, threw away `last_repair`, `window_*` and `notice_at` along
# with the outage. A node that wobbles would then get a `tailscale up` every
# cycle, 12 an hour against a cap of 6, which is precisely the "flapped harder
# by us" case the caps exist to prevent (LAC-5276 review). The repair history
# has to outlive the outage that produced it.
clear_outage() {
  DOWN_SINCE=0; PAGED=0; ATTEMPTS=0; GAVE_UP=0; RECOVERED_AT=0
  state_put
}

# --- the notifier ----------------------------------------------------------

# A JSON string needs backslash, double quote and control bytes escaped, in that
# order, or the escaping escapes itself. Every control byte is flattened rather
# than the three a message is likely to contain, because a raw \x1b would make
# invalid JSON, Slack would reject it, and the rejection would eat the page.
json_string() {
  printf '%s' "$1" | tr '[:cntrl:]' ' ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

slack_token() {
  if [ -n "$SLACK_TOKEN" ]; then printf '%s' "$SLACK_TOKEN"; return 0; fi
  [ -r "$SLACK_TOKEN_FILE" ] || return 1
  # The same file and key the power watch reads, so there is one bot token on
  # this host rather than a second copy to rotate.
  jq -r '.channels.slack.botToken // empty' "$SLACK_TOKEN_FILE" 2>/dev/null
}

# A pager that needs the broken thing to work is not a pager. The headline
# failure here is "this host cannot resolve public names", and slack.com is a
# public name, so the one case this has to deliver in is exactly the case where
# the normal request cannot resolve. curl exit 6 is "could not resolve host":
# when that happens, ask a resolver we name by IP and pin the answer.
#
# The fallback is also the reason the give-up page is worth writing at all. If
# even this cannot get out, library's dead-man's switch still pages from off the
# host, which is the backstop by design (LAC-4874).
slack_post() {
  local token=$1 payload=$2 host ip response code
  response=$(curl -sS -m 15 -X POST "$SLACK_API_URL" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data "$payload" 2>&1)
  code=$?
  if [ "$code" != "6" ]; then printf '%s' "$response"; return "$code"; fi

  host=$(printf '%s' "$SLACK_API_URL" | sed -e 's#^https\{0,1\}://##' -e 's#[:/].*##')
  ip=$("$DIG" "@$PUBLIC_RESOLVER" +short +time=3 +tries=1 "$host" A 2>/dev/null \
    | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)
  if [ -z "$ip" ]; then
    printf 'could not resolve %s even via %s\n' "$host" "$PUBLIC_RESOLVER"
    return 6
  fi
  printf 'resolved %s to %s via %s because the system resolver could not\n' \
    "$host" "$ip" "$PUBLIC_RESOLVER" >&2
  curl -sS -m 15 -X POST "$SLACK_API_URL" \
    --resolve "${host}:443:${ip}" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data "$payload" 2>&1
}

# Returns non-zero and prints why rather than exiting, so a broken notifier
# still leaves the event in the log and the exit code honest.
notify() {
  local text=$1 token response
  token=$(slack_token)
  if [ -z "${token:-}" ]; then
    printf 'no Slack token: set TS_WATCHDOG_SLACK_TOKEN or fix %s\n' "$SLACK_TOKEN_FILE" >&2
    return 1
  fi
  response=$(slack_post "$token" \
    "{\"channel\":\"$(json_string "$SLACK_CHANNEL")\",\"text\":\"$(json_string "$text")\"}")
  if printf '%s' "$response" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
    return 0
  fi
  printf 'Slack rejected the message: %s\n' "$response" >&2
  return 1
}

# Everything that leaves the host goes through here, so a dry run can be read
# for exactly what a real run would have sent.
announce() {
  local kind=$1 text=$2
  if [ "$NOTIFY" != "1" ]; then
    printf 'would %s: %s\n' "$kind" "$text"
    return 0
  fi
  notify "$text"
}

# --- dependencies ----------------------------------------------------------
#
# Before anything else, and exit 2 rather than 0. Without curl there is no probe
# and no way to report that there is no probe.
for dep in curl jq date; do
  command -v "$dep" >/dev/null 2>&1 || {
    printf 'tailscale-watchdog needs %s and it is not on PATH\n' "$dep" >&2
    exit 2
  }
done

# dig and the Tailscale CLI are checked by path rather than by name, because
# both are overridden to fakes by the tests. Missing either is exit 2 and not a
# degraded run: without dig this cannot tell a dead resolver from a dead link,
# and it cannot page with DNS down; without the CLI it cannot read the one shape
# it is allowed to repair. Both failures would read as "nothing to do", which is
# the one answer a watchdog must never give by accident.
for tool in "$DIG" "$TAILSCALE"; do
  [ -x "$tool" ] || {
    printf 'tailscale-watchdog needs %s and it is not executable\n' "$tool" >&2
    exit 2
  }
done

# Proven by writing, not by `[ -w ]`. The permission bit is not the failure that
# threatens this host; free space is.
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
  printf 'tailscale-watchdog: %s\n' "$DEGRADED" >&2
else
  printf 'tailscale-watchdog cannot write to %s or %s, so it cannot time an outage or rate-limit a repair\n' \
    "$PRIMARY_DIR" "$FALLBACK_DIR" >&2
  exit 2
fi

STATE_FILE="$WATCH_DIR/state"
LOG_FILE="$WATCH_DIR/tailscale-watchdog.log"
# Separate from the state file and never cleared by a recovery: a DNS override
# outlives the outage that caused it, and the whole point is that it stays
# visible until a human decides otherwise.
OVERRIDE_FILE="$WATCH_DIR/dns-override"
LAST_OK_FILE="$WATCH_DIR/last-ok"

# --- probes ----------------------------------------------------------------

PLANE_WHY=""
PUBLIC_WHY=""

# A 200 carrying the health JSON. A 200 of something else is a captive portal.
#
# On a connection failure curl writes its own `000` and also exits non-zero, so
# normalising keeps one spelling for "no answer" whatever shape the failure
# took. The curl message is kept because an http=000 and a `TLS connect error`
# both look like a firewall and neither one is, and whoever reads this log next
# should not have to re-derive that.
why() {
  local http=$1 err_file=$2 text
  text=$(tr -d '\r' < "$err_file" | tr '\n' ' ' | sed 's/  */ /g; s/ *$//')
  printf 'http=%s%s' "$http" "${text:+ $text}"
}

probe_plane() {
  local body http err
  body=$(mktemp); err=$(mktemp)
  http=$(curl -sS -m "$TIMEOUT" -o "$body" -w '%{http_code}' "$PLANE_URL" 2>"$err")
  case "$http" in [0-9][0-9][0-9]) ;; *) http=000 ;; esac
  PLANE_WHY=$(why "$http" "$err")
  if [ "$http" = "200" ] && jq -e '.status' "$body" >/dev/null 2>&1; then
    rm -f "$body" "$err"; return 0
  fi
  rm -f "$body" "$err"; return 1
}

probe_public() {
  local http err
  err=$(mktemp)
  http=$(curl -sS -m "$TIMEOUT" -o /dev/null -w '%{http_code}' "$PUBLIC_URL" 2>"$err")
  case "$http" in [0-9][0-9][0-9]) ;; *) http=000 ;; esac
  PUBLIC_WHY=$(why "$http" "$err")
  rm -f "$err"
  [ "$http" = "200" ]
}

# --- attribution -----------------------------------------------------------

TS_STATE=""
TS_SHAPE=""

# Sets TS_SHAPE to one of: recoverable, needs_human, running, unknown, and
# TS_STATE to the readable form of what it saw.
#
# Two globals rather than a value on stdout, because stdout would have to be
# read through a command substitution, that runs in a subshell, and TS_STATE
# would be empty in the parent. The page said "needs a human: " with nothing
# after the colon, which is exactly the half of the message worth having.
#
# HaveNodeKey and AuthURL come from `status --json`; LoggedOut comes from `debug
# prefs`. Worth writing down because the original issue attributed HaveNodeKey
# to prefs, where this version of the CLI does not emit it, and a condition that
# reads a missing field is a condition that never fires.
#
# `unknown` is deliberately not repaired. If the CLI cannot even answer, the
# daemon is not listening and `tailscale up` has nothing to talk to, which is
# the human case, not ours.
tailscale_shape() {
  local status prefs backend authurl havekey loggedout
  status=$("$TAILSCALE" status --json 2>/dev/null)
  prefs=$("$TAILSCALE" debug prefs 2>/dev/null)
  backend=$(printf '%s' "$status" | jq -r '.BackendState // empty' 2>/dev/null)
  authurl=$(printf '%s' "$status" | jq -r '.AuthURL // ""' 2>/dev/null)
  # Not `// false` and not `// "unknown"`. jq's alternative operator treats
  # `false` as empty, so `.LoggedOut // "unknown"` returns "unknown" for a node
  # that is logged *in*, which is the exact shape this watchdog exists to
  # repair. That version read every recoverable node as "the CLI did not answer"
  # and refused to touch it. An explicit null test is the only correct form for
  # a boolean field.
  havekey=$(printf '%s' "$status" | jq -r 'if .HaveNodeKey == null then "unknown" else (.HaveNodeKey | tostring) end' 2>/dev/null)
  loggedout=$(printf '%s' "$prefs" | jq -r 'if .LoggedOut == null then "unknown" else (.LoggedOut | tostring) end' 2>/dev/null)

  if [ -z "$backend" ] || [ "$loggedout" = "unknown" ]; then
    TS_STATE="the Tailscale CLI did not answer, so the daemon is not listening"
    TS_SHAPE=unknown; return
  fi
  TS_STATE="BackendState=$backend LoggedOut=$loggedout HaveNodeKey=$havekey AuthURL=${authurl:-empty}"
  if [ "$loggedout" = "true" ] || [ -n "$authurl" ]; then TS_SHAPE=needs_human; return; fi
  # An expired node key reports NeedsLogin with LoggedOut still false and no
  # AuthURL yet, so it would otherwise pass the act branch. `tailscale up` then
  # blocks for its full timeout waiting for a browser nobody is looking at, and
  # only the *next* cycle sees the AuthURL and routes it to a human. Naming
  # these two states here costs one case statement and saves a 30-second stall
  # inside a launchd job (LAC-5276 review nit).
  case "$backend" in
    NeedsLogin|NeedsMachineAuth) TS_SHAPE=needs_human; return ;;
  esac
  if [ "$backend" = "Running" ]; then TS_SHAPE=running; return; fi
  if [ "$havekey" = "true" ]; then TS_SHAPE=recoverable; return; fi
  # Not Running, not logged out, and no node key. Not a shape anybody has seen,
  # and the rule is to act only on the unambiguous one.
  TS_SHAPE=unknown
}

# True when the public probe failed but a resolver we name by IP answers. That
# difference is the whole discriminator: it means the names are fine, the
# internet is fine, and this host's resolver configuration is the broken part,
# which is the one DNS fault worth repairing automatically.
resolver_is_the_fault() {
  "$DIG" "@$PUBLIC_RESOLVER" +short +time=3 +tries=1 "$PUBLIC_CANARY" A 2>/dev/null \
    | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'
}

# The service that carries the default route, rather than a hardcoded "Wi-Fi".
# The same laptop is on the Thunderbolt dock often enough that configuring the
# wrong service would be a silent no-op repair, which is worse than no repair.
# Empty output means "I cannot tell", and nothing is configured in that case.
primary_service() {
  local device
  device=$("$ROUTE" -n get default 2>/dev/null | awk '/interface:/ {print $2; exit}')
  [ -n "$device" ] || return 0
  # Lines come in pairs: "(15) Wi-Fi" then "(Hardware Port: Wi-Fi, Device: en0)".
  # Disabled services are listed as "(*) Name" and are skipped by the index
  # pattern, which is correct: configuring a disabled service does nothing.
  "$NETWORKSETUP" -listnetworkserviceorder 2>/dev/null | awk -v dev="$device" '
    /^\([0-9]+\)/ { name = $0; sub(/^\([0-9]+\) /, "", name); next }
    index($0, "Device: " dev ")") { print name; exit }
  '
}

# --- repairs ---------------------------------------------------------------

# The flags the CLI itself prints, which preserve the current prefs rather than
# resetting them. --timeout is what keeps this from hanging a launchd job.
repair_tailscale() {
  local out code
  out=$("$TAILSCALE" up --timeout=30s --accept-routes 2>&1); code=$?
  if [ "$code" = "0" ]; then
    log "REPAIR tailscale up returned ok"
  else
    log "REPAIR tailscale up exited $code: $(printf '%s' "$out" | tr '\n' ' ' | sed 's/  */ /g')"
  fi
  [ "$SETTLE" -gt 0 ] && sleep "$SETTLE"
  return 0
}

DNS_SERVICE=""
DNS_PREVIOUS=""
# Set only by a repair that actually landed this cycle. The override *file* is
# not the same question: it survives the outage that created it, so a later
# cycle that fixed something else entirely would otherwise report "DNS now
# overrides DHCP (was unset)" about a change it did not make.
DNS_OVERRIDE_SET=0

# Records what it did, because an invisible change to the owner's laptop is the
# wrong kind of fix. The previous value is kept so the undo is obvious even
# months later, and nothing here ever reverts to DHCP on its own: 10.0.0.243 may
# be a Pi-hole Lacy wants back, and that is his call, not this script's.
repair_dns() {
  DNS_SERVICE=$(primary_service)
  if [ -z "$DNS_SERVICE" ]; then
    log "REPAIR-SKIPPED cannot name the network service carrying the default route, so there is nothing safe to configure"
    return 1
  fi
  DNS_PREVIOUS=$("$NETWORKSETUP" -getdnsservers "$DNS_SERVICE" 2>/dev/null | tr '\n' ' ' | sed 's/ *$//')
  # Unquoted on purpose: networksetup takes the resolvers as separate arguments,
  # so the splitting is the interface.
  # shellcheck disable=SC2086
  if ! "$NETWORKSETUP" -setdnsservers "$DNS_SERVICE" $DNS_SERVERS >/dev/null 2>&1; then
    log "REPAIR-FAILED networksetup -setdnsservers $DNS_SERVICE refused the change"
    return 1
  fi
  printf 'set_at=%s\nservice=%s\nservers=%s\nprevious=%s\n' \
    "$(at_epoch "$(now)" %Y-%m-%dT%H:%M:%S%z)" "$DNS_SERVICE" "$DNS_SERVERS" "${DNS_PREVIOUS:-unset}" \
    > "$OVERRIDE_FILE" 2>/dev/null \
    || log "STATE-WRITE-FAILED set DNS on $DNS_SERVICE but could not record it in $OVERRIDE_FILE"
  DNS_OVERRIDE_SET=1
  log "REPAIR set DNS on $DNS_SERVICE to $DNS_SERVERS (was ${DNS_PREVIOUS:-unset}); undo with: networksetup -setdnsservers $DNS_SERVICE empty"
  [ "$SETTLE" -gt 0 ] && sleep "$SETTLE"
  return 0
}

# --- how long was it actually broken ---------------------------------------

# How long the *fleet* could not reach this host, rather than how long this
# watchdog has known about it. With a 5-minute interval, a stop one second after
# a healthy cycle is already five minutes old when the next cycle sees it, and
# the first proof run said "healthy again after 0m" about a fleet that had been
# unable to write for four minutes and forty-six seconds. That is the wrong
# number to hand Lacy.
#
# It is a bound, not a guess: the last healthy check is the earliest moment the
# host was provably fine. When there is no such record, it falls back to saying
# only what it can prove.
# The second argument is when it ended, defaulting to now. It is only ever
# passed a pinned recovery moment, so a notifier that was broken for an hour
# cannot add that hour to the outage it is finally reporting.
outage_phrase() {
  local since=$1 until=${2:-$NOW} start=$1
  if [ "$LAST_OK" != "0" ] && [ "$LAST_OK" -lt "$since" ]; then start=$LAST_OK; fi
  if [ "$start" = "$since" ]; then
    printf 'for %s' "$(fmt_duration $((until - since)))"
  else
    printf 'for up to %s (last healthy check %s)' \
      "$(fmt_duration $((until - start)))" "$(at_epoch "$start" '%H:%M %Z')"
  fi
}

# Unchecked on purpose, and the only write in this file that is. It degrades a
# number in a message; it cannot switch the pager off, which is what the checked
# writes are protecting.
remember_ok() {
  printf '%s\n' "$NOW" > "$LAST_OK_FILE" 2>/dev/null \
    || log "NOTE could not record this healthy check in $LAST_OK_FILE, so the next outage will report a narrower window than it should"
}

# Said on every healthy cycle while the override is in place, so it cannot
# become a mystery somebody rediscovers during the next outage.
override_note() {
  [ -f "$OVERRIDE_FILE" ] || return 0
  local service servers previous set_at
  service=$(sed -n 's/^service=//p' "$OVERRIDE_FILE" | tail -n1)
  servers=$(sed -n 's/^servers=//p' "$OVERRIDE_FILE" | tail -n1)
  previous=$(sed -n 's/^previous=//p' "$OVERRIDE_FILE" | tail -n1)
  set_at=$(sed -n 's/^set_at=//p' "$OVERRIDE_FILE" | tail -n1)
  printf ' [dns-override: %s on %s since %s, was %s; undo with networksetup -setdnsservers %s empty]' \
    "$servers" "$service" "$set_at" "$previous" "$service"
}

# --- state -----------------------------------------------------------------

NOW=$(now)
DOWN_SINCE=$(state_get down_since); : "${DOWN_SINCE:=0}"
PAGED=$(state_get paged); : "${PAGED:=0}"
ATTEMPTS=$(state_get attempts); : "${ATTEMPTS:=0}"
GAVE_UP=$(state_get gave_up); : "${GAVE_UP:=0}"
LAST_REPAIR=$(state_get last_repair); : "${LAST_REPAIR:=0}"
WINDOW_START=$(state_get window_start); : "${WINDOW_START:=0}"
WINDOW_REPAIRS=$(state_get window_repairs); : "${WINDOW_REPAIRS:=0}"
NOTICE_AT=$(state_get notice_at); : "${NOTICE_AT:=0}"
# Present only between measuring a recovery and delivering it.
RECOVERED_AT=$(state_get recovered_at); : "${RECOVERED_AT:=0}"

LAST_OK=$(sed -n 's/^\([0-9]\{1,\}\)$/\1/p' "$LAST_OK_FILE" 2>/dev/null | tail -n1)
: "${LAST_OK:=0}"

# --- cycle -----------------------------------------------------------------

PLANE_OK=0; probe_plane && PLANE_OK=1
PUBLIC_OK=0; probe_public && PUBLIC_OK=1

if [ "$PLANE_OK" = "1" ] && [ "$PUBLIC_OK" = "1" ]; then
  if [ "$DOWN_SINCE" != "0" ]; then
    # An earlier cycle may have measured this recovery and failed to deliver it.
    # That number is the honest one: recomputing would quietly add however long
    # the notifier stayed broken to the outage being reported.
    if [ "$RECOVERED_AT" != "0" ]; then AT=$RECOVERED_AT; else AT=$NOW; fi
    WAS_BROKEN=$(outage_phrase "$DOWN_SINCE" "$AT")
    if [ "$PAGED" = "1" ]; then
      message="Zero is back on the network. The control plane and public DNS both answer again, after being broken $WAS_BROKEN. Anything scheduled in that window did not run."
      log "RECOVERED $WAS_BROKEN"
      if announce "say recovered" "$message"; then
        clear_outage || log "STATE-WRITE-FAILED recovery delivered but could not be recorded, so it will repeat next cycle"
      else
        # The outage is over and unreported. Keep the state so the next cycle
        # retries rather than silently spending the message it owes, and pin the
        # moment it came back so the retry reports the measured duration.
        log "NOTIFY-FAILED recovery not delivered, keeping the outage open so the next cycle retries"
        RECOVERED_AT=$AT
        state_put || log "STATE-WRITE-FAILED could not pin the recovery moment, so a retry will over-report the outage"
      fi
    else
      log "BLIP was broken $WAS_BROKEN and recovered before the $(fmt_duration "$PAGE_AFTER") threshold"
      clear_outage || log "STATE-WRITE-FAILED recovered from a blip but could not clear the outage, so the next cycle will read it as still broken"
    fi
  else
    log "OK plane and public DNS both answer${DEGRADED:+ (degraded: $DEGRADED)}$(override_note)"
  fi
  remember_ok
  exit 0
fi

# Broken. Start the clock on the first failing cycle; that cycle does not page.
FIRST_FAILURE=0
if [ "$DOWN_SINCE" = "0" ]; then DOWN_SINCE=$NOW; FIRST_FAILURE=1; fi
ELAPSED=$((NOW - DOWN_SINCE))

FAULTS=""
[ "$PLANE_OK" = "0" ] && FAULTS="tailnet"
[ "$PUBLIC_OK" = "0" ] && FAULTS="${FAULTS:+$FAULTS+}public-dns"
log "BROKEN $FAULTS plane[${PLANE_WHY}] public[${PUBLIC_WHY}] for $(fmt_duration "$ELAPSED")"

# --- should we repair at all ----------------------------------------------

REPAIR_BLOCKED=""
if [ "$GAVE_UP" = "1" ]; then
  REPAIR_BLOCKED="already gave up after $ATTEMPTS attempts"
elif [ $((NOW - LAST_REPAIR)) -lt "$MIN_REPAIR_GAP" ] && [ "$LAST_REPAIR" != "0" ]; then
  REPAIR_BLOCKED="rate cap: last repair was $((NOW - LAST_REPAIR))s ago, floor is ${MIN_REPAIR_GAP}s"
elif [ "$WINDOW_START" != "0" ] && [ $((NOW - WINDOW_START)) -lt "$REPAIR_WINDOW" ] \
     && [ "$WINDOW_REPAIRS" -ge "$MAX_REPAIRS_PER_WINDOW" ]; then
  REPAIR_BLOCKED="rate cap: $WINDOW_REPAIRS repairs already in the last $(fmt_duration "$((NOW - WINDOW_START))"), cap is $MAX_REPAIRS_PER_WINDOW per $(fmt_duration "$REPAIR_WINDOW")"
fi

# Rolling window bookkeeping. Reset once the window has passed.
if [ "$WINDOW_START" = "0" ] || [ $((NOW - WINDOW_START)) -ge "$REPAIR_WINDOW" ]; then
  WINDOW_START=$NOW; WINDOW_REPAIRS=0
fi

tailscale_shape
SHAPE=$TS_SHAPE
NEEDS_HUMAN=""
DID=""
ATTEMPTED=0

if [ -n "$REPAIR_BLOCKED" ]; then
  log "NO-REPAIR $REPAIR_BLOCKED"
else
  # --- rung 1: the tailnet -------------------------------------------------
  if [ "$PLANE_OK" = "0" ]; then
    case "$SHAPE" in
      recoverable)
        log "LADDER rung 1, tailnet is down in the recoverable shape: $TS_STATE"
        if [ "$REPAIR" = "1" ]; then
          ATTEMPTED=1
          repair_tailscale
          DID="tailscale up"
          probe_plane && PLANE_OK=1
          log "RE-PROBE plane $([ "$PLANE_OK" = "1" ] && echo ok || echo "still failing [${PLANE_WHY}]")"
          # ts.net coming back can also fix the public path, since MagicDNS
          # forwards through it. Re-probe rather than assume either way.
          if [ "$PUBLIC_OK" = "0" ]; then
            probe_public && PUBLIC_OK=1
          fi
        else
          printf 'would repair: tailscale up --timeout=30s --accept-routes\n'
        fi
        ;;
      needs_human)
        NEEDS_HUMAN="Tailscale on zero needs a human sign-in: $TS_STATE. The watchdog did not touch it on purpose, because \`tailscale up\` on a logged-out node does nothing but wait for a browser."
        log "NO-REPAIR tailnet needs a human: $TS_STATE"
        ;;
      unknown)
        NEEDS_HUMAN="Tailscale on zero is in a shape the watchdog will not touch: $TS_STATE. A wedged network extension needs a restart with sudo, which is a human's job."
        log "NO-REPAIR tailnet shape is not the recoverable one: $TS_STATE"
        ;;
      running)
        # The daemon says Running and the plane still does not answer, so the
        # fault is not Tailscale's state. Restarting it would be a guess.
        log "NO-REPAIR tailnet reports Running but the plane does not answer: $TS_STATE"
        ;;
    esac
  fi

  # --- rung 2: the system resolver ----------------------------------------
  #
  # Re-probed above, so this only fires if rung 1 did not already fix it. Order
  # matters: bringing ts.net back can restore the public path too, and a DNS
  # override installed for a fault that rung 1 was about to clear would be an
  # unnecessary change to Lacy's machine.
  if [ "$PUBLIC_OK" = "0" ]; then
    if resolver_is_the_fault; then
      log "LADDER rung 2, public DNS fails here but $PUBLIC_RESOLVER answers for $PUBLIC_CANARY, so this host's resolver is the fault"
      if [ "$REPAIR" = "1" ]; then
        ATTEMPTED=1
        if repair_dns; then
          DID="${DID:+$DID, then }set DNS on ${DNS_SERVICE} to ${DNS_SERVERS}"
          probe_public && PUBLIC_OK=1
          log "RE-PROBE public $([ "$PUBLIC_OK" = "1" ] && echo ok || echo "still failing [${PUBLIC_WHY}]")"
        fi
      else
        printf 'would repair: networksetup -setdnsservers %s %s\n' "$(primary_service)" "$DNS_SERVERS"
      fi
    else
      # 1.1.1.1 is silent too, so this is the link or the gateway. Rewriting
      # DNS here would be a wrong repair that outlives the outage.
      NEEDS_HUMAN="${NEEDS_HUMAN:+$NEEDS_HUMAN }Zero has no working internet at all: public DNS fails and $PUBLIC_RESOLVER does not answer either, so this is the link or the gateway, not the resolver configuration. The watchdog changed nothing."
      log "NO-REPAIR public DNS fails and $PUBLIC_RESOLVER is silent too, so the link is down, not the resolver config"
    fi
  fi
fi

# --- did it work ----------------------------------------------------------

if [ "$ATTEMPTED" = "1" ]; then
  LAST_REPAIR=$NOW
  WINDOW_REPAIRS=$((WINDOW_REPAIRS + 1))
fi

if [ "$PLANE_OK" = "1" ] && [ "$PUBLIC_OK" = "1" ]; then
  WAS_BROKEN=$(outage_phrase "$DOWN_SINCE")
  log "FIXED $DID; healthy again, was broken $WAS_BROKEN"
  # A successful repair is still a change to Lacy's laptop, and if it set a
  # resolver it is a change he has to be able to see. Rate-limited, so a bad
  # afternoon is a couple of messages rather than a muted channel. If an outage
  # had already paged, the recovery message is owed instead and is not gated.
  message="Zero's network was broken and the watchdog fixed it: $DID. Unreachable $WAS_BROKEN."
  if [ "$DNS_OVERRIDE_SET" = "1" ]; then
    message="$message DNS on $DNS_SERVICE now overrides DHCP (was ${DNS_PREVIOUS:-unset}); undo with: networksetup -setdnsservers $DNS_SERVICE empty."
  fi
  if [ "$PAGED" = "1" ] || [ $((NOW - NOTICE_AT)) -ge "$NOTICE_GAP" ]; then
    if announce "say fixed" "$message"; then NOTICE_AT=$NOW; fi
  else
    log "QUIET fixed it, and the last notice was $(fmt_duration "$((NOW - NOTICE_AT))") ago, under the $(fmt_duration "$NOTICE_GAP") gap"
  fi
  # The repair counters survive; the outage does not.
  clear_outage || log "STATE-WRITE-FAILED fixed it but could not record the repair, so the rate cap is blind next cycle"
  remember_ok
  exit 0
fi

# Still broken. The attempt counter only counts attempts that failed, so a
# healthy node that needed one nudge never marches toward the give-up line.
if [ "$ATTEMPTED" = "1" ]; then
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ] && [ "$GAVE_UP" = "0" ]; then
    GAVE_UP=1
    log "GAVE-UP $ATTEMPTS repair attempts did not fix it, not trying again until it is healthy"
  fi
fi

PAGE=""
if [ "$PAGED" = "0" ]; then
  if [ "$GAVE_UP" = "1" ]; then
    PAGE="Zero's network is broken and the watchdog could not fix it. Failing: $FAULTS. It tried $ATTEMPTS times${DID:+ ($DID)}, broken $(outage_phrase "$DOWN_SINCE"), and the host still cannot reach $([ "$PLANE_OK" = "0" ] && printf 'its own control plane')$([ "$PLANE_OK" = "0" ] && [ "$PUBLIC_OK" = "0" ] && printf ' or ')$([ "$PUBLIC_OK" = "0" ] && printf 'the public internet'). $TS_STATE. Every agent write is failing until this is fixed."
  elif [ -n "$NEEDS_HUMAN" ] && [ "$ELAPSED" -ge "$PAGE_AFTER" ]; then
    PAGE="Zero's network has been broken $(outage_phrase "$DOWN_SINCE") and only you can fix it. Failing: $FAULTS. $NEEDS_HUMAN Every agent write is failing until this is fixed."
  elif [ "$ELAPSED" -ge "$PAGE_AFTER" ]; then
    PAGE="Zero's network has been broken $(outage_phrase "$DOWN_SINCE"). Failing: $FAULTS. $TS_STATE. plane[$PLANE_WHY] public[$PUBLIC_WHY]. Every agent write is failing until this is fixed."
  fi
fi

if [ -n "$PAGE" ]; then
  log "PAGE $PAGE"
  if announce "page" "$PAGE"; then
    # Recorded only on a delivered message, so a Slack outage retries next
    # cycle instead of silently spending the one page this outage was owed.
    PAGED=1
  else
    log "NOTIFY-FAILED page not delivered, will retry next cycle"
  fi
elif [ "$PAGED" = "1" ]; then
  log "STILL-BROKEN $FAULTS for $(fmt_duration "$ELAPSED"), already paged"
elif [ "$FIRST_FAILURE" = "1" ]; then
  log "CLOCK-STARTED paging if this lasts $(fmt_duration "$PAGE_AFTER")"
fi

# A dry run must not consume the page, or the repair budget, that a real cycle
# still owes. So it writes nothing at all.
if [ "$REPAIR" = "1" ] || [ "$NOTIFY" = "1" ]; then
  state_put || {
    # The clock cannot be persisted, so no later cycle will ever reach the
    # threshold. Say so now rather than going quiet, because silence is also
    # what a healthy host looks like.
    log "STATE-WRITE-FAILED cannot persist the outage clock, so the threshold will never be reached"
    announce "page" "Zero's network is broken and the watchdog cannot write $STATE_FILE, so it cannot time the outage or rate-limit its own repairs. Treat silence from it as meaningless until that is fixed." >/dev/null \
      || printf 'and could not report it to Slack either\n' >&2
  }
fi

exit 1
