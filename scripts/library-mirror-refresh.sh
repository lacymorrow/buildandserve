#!/usr/bin/env bash
#
# Mirrors every GitHub repo Lacy can reach onto `library` (LAC-4898).
#
# Runs ON library, from cron, daily at 08:00. It talks to github.com directly so
# the mirror is a directly-restorable backup and the Mac is never in the path.
#
# The master copy is `scripts/library-mirror-refresh.sh` in the buildandserve
# repo. `/boot/config/scripts/library-mirror-refresh.sh` on library is a copy of
# it, and the cron line invokes it through bash:
#
#   0 8 * * * /usr/bin/bash /boot/config/scripts/library-mirror-refresh.sh --notify \
#     >> /mnt/cachex/appdata/github-mirror/cron.log 2>&1
#
# Three Unraid traps are baked into that line, all written up in
# docs/ops/library-github-mirror.md:
#
#   1. `/boot` is FAT32, so it cannot hold an exec bit. `chmod +x` there is a
#      silent no-op and the script can only run through an interpreter.
#   2. The root filesystem is RAM and is rebuilt every boot, so anything staged
#      into `/usr/local/bin` is gone after a reboot unless `/boot/config/go`
#      copies it back. The original cron line pointed at
#      `/usr/local/bin/library-mirror-refresh.sh` and nothing staged it, so the
#      job was a no-op from 2026-07-23 to 2026-10-19 and nobody heard about it.
#   3. State goes on `/mnt/cachex`, never `/mnt/user`: the appdata share sets a
#      97.7G floor above the pool's free space and refuses writes with ENOSPC
#      while `df` cheerfully reports free space.
#
# What this script is careful about, having been the thing that failed silently:
# it reports failure. A GitHub 401, an empty repo list, or a repo that would not
# fetch all end in a non-zero exit, a line in the log, a line on stderr (which
# cron captures into cron.log), and with --notify a Slack DM. "Nothing in the
# log" has to mean "it ran and it worked", or the backup is a rumour.
#
# It reports an outage ONCE, which is the other half of the same idea (LACA-2947).
# The daily cron used to DM on every run, so one expired token announced itself
# seven times a week for fifteen weeks and buried the channel it shares with
# Lacy's approval cards. Now a DM costs a CHANGE of state: the first run of an
# outage, one reminder a week while it is unfixed, and the run that recovers.
# Silence while red is deliberate but bounded, because permanent silence while
# red is the original defect, not the fix for it.
#
# It also warns BEFORE the credential dies. The token this reads is a
# fine-grained PAT, and those carry a mandatory expiry, so the July 2026 outage
# is a thing that recurs on a timer rather than a one-off. GitHub returns the
# expiry on every authenticated call and nothing was reading it.
#
# Exit codes: 0 = every repo is current, 1 = the refresh failed or was partial,
# 2 = it could not do its job at all (no git, no token, nowhere to write).

set -uo pipefail

# cron hands a job a nearly empty PATH and this must not fail for a reason that
# boring. Homebrew is last so the same file runs on a Mac under test.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/homebrew/bin"

STATE_DIR="${LIBRARY_MIRROR_STATE_DIR:-/mnt/cachex/appdata/github-mirror}"
MIRROR="${LIBRARY_MIRROR_DIR:-/mnt/user/Backup/github-mirror}"
TOKEN_FILE="${LIBRARY_MIRROR_TOKEN_FILE:-$STATE_DIR/.token}"
LOG="${LIBRARY_MIRROR_LOG:-$STATE_DIR/refresh.log}"
API="${LIBRARY_MIRROR_API:-https://api.github.com}"
GIT_HOST="${LIBRARY_MIRROR_GIT_HOST:-https://github.com}"
CURL_TIMEOUT="${LIBRARY_MIRROR_TIMEOUT:-30}"
LOG_KEEP="${LIBRARY_MIRROR_LOG_KEEP:-2000}"

# The notification ledger: which outage Lacy has already been told about. It
# lives beside the log on `/mnt/cachex` for trap 3 above. One line:
#   <key> <first_seen_epoch> <last_notified_epoch> <runs_since_first_seen>
NOTIFY_STATE="${LIBRARY_MIRROR_NOTIFY_STATE:-$STATE_DIR/notify-state}"
# How long an unfixed outage stays quiet between reminders. A week, so a
# standing failure costs one DM every seven days instead of seven.
REMIND_AFTER="${LIBRARY_MIRROR_REMIND_AFTER:-604800}"
# How close to expiry the token has to be before the warning is worth a DM.
EXPIRY_WARN_DAYS="${LIBRARY_MIRROR_EXPIRY_WARN_DAYS:-14}"

# The dark watch already owns a Slack bot token on this box, so failures reuse
# its channel rather than introducing a second credential to rot.
SLACK_API="${LIBRARY_MIRROR_SLACK_API:-https://slack.com/api/chat.postMessage}"
SLACK_CHANNEL="${LIBRARY_MIRROR_SLACK_CHANNEL:-U3XC80UUQ}"
SLACK_TOKEN_FILE="${LIBRARY_MIRROR_SLACK_TOKEN_FILE:-/mnt/cachex/appdata/fleet-dark-watch/slack-token}"

NOTIFY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --notify) NOTIFY=1 ;;
    -h | --help)
      printf 'usage: library-mirror-refresh.sh [--notify]\n\n'
      printf 'Mirrors every reachable GitHub repo into %s.\n' "$MIRROR"
      printf '  --notify   Slack-DM Lacy when the refresh fails, once per\n'
      printf '             outage plus a weekly reminder, and once when it\n'
      printf '             recovers. Ledger: %s\n' "$NOTIFY_STATE"
      printf 'Exit: 0 all current, 1 failed or partial, 2 could not run.\n'
      exit 0
      ;;
    *)
      printf 'library-mirror-refresh: unknown argument %s\n' "$1" >&2
      exit 2
      ;;
  esac
  shift
done

TOKEN=""

# Everything logged passes through here, because the one thing that must never
# reach a log or a Slack message is the token itself. git and curl both print it
# back inside URLs on failure.
scrub() {
  if [ -n "$TOKEN" ]; then
    printf '%s' "$1" | sed "s|$TOKEN|***|g"
  else
    printf '%s' "$1"
  fi
}

log() {
  local line
  line="$(scrub "$1")"
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$line" >>"$LOG" 2>/dev/null
  # Only when someone is watching. Routine success belongs in the log, not in
  # cron.log, or the file that is supposed to hold failures fills with noise.
  if [ -t 1 ]; then printf '%s\n' "$line"; fi
}

# Failures go to the log AND to stderr, which is what cron.log records. A run
# that leaves cron.log empty is a run that worked.
loud() {
  local line
  line="$(scrub "$1")"
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$line" >>"$LOG" 2>/dev/null
  printf '%s\n' "$line" >&2
}

# Slack-DMs one line. Returns non-zero and says why rather than exiting, so a
# broken notifier still leaves the event in the log and the exit code honest.
notify() {
  local text token response
  [ "$NOTIFY" = "1" ] || return 0
  # Scrubbed here too, not just in the log: a GitHub error body quotes the
  # credential back, and a Slack DM is the one copy that leaves the building.
  text="$(scrub "$1")"
  if [ -r "$SLACK_TOKEN_FILE" ]; then
    token=$(tr -d ' \t\n\r' <"$SLACK_TOKEN_FILE")
  else
    loud "cannot notify: no Slack token at $SLACK_TOKEN_FILE"
    return 1
  fi
  response=$(curl -sS -m 15 -X POST "$SLACK_API" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json; charset=utf-8' \
    --data "$(jq -n --arg c "$SLACK_CHANNEL" --arg t "$text" '{channel:$c,text:$t}')" 2>&1)
  if printf '%s' "$response" | jq -e '.ok == true' >/dev/null 2>&1; then
    return 0
  fi
  loud "Slack rejected the message: $response"
  return 1
}

rotate_log() {
  tail -n "$LOG_KEEP" "$LOG" >"$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
}

# --- the notification ledger ------------------------------------------------
#
# Dedup is keyed on a short KEY the caller passes, never on the message text.
# The messages carry page numbers and repo counts that move between runs of one
# unchanging outage, so hashing the text would DM once per run again. A key
# names the KIND of failure, which is what "one DM per outage" has to mean: a
# 401 that becomes a 500 is a new outage and says so, a 401 that stays a 401 is
# the same one and stays quiet.

ledger_key=""
ledger_first=0
ledger_last=0
ledger_runs=0

read_ledger() {
  ledger_key=""
  ledger_first=0
  ledger_last=0
  ledger_runs=0
  [ -r "$NOTIFY_STATE" ] || return 0
  local k f l r
  read -r k f l r <"$NOTIFY_STATE" 2>/dev/null || return 0
  # A truncated or hand-edited ledger must not crash the backup, and must not be
  # read as "already told him" either. Anything non-numeric resets to no record.
  case "${f:-}${l:-}${r:-}" in
    '' | *[!0-9]*) return 0 ;;
  esac
  ledger_key="${k:-}"
  ledger_first="$f"
  ledger_last="$l"
  ledger_runs="$r"
}

# Returns non-zero if the ledger could not be written, which the callers treat
# as a reason to DM rather than a reason to stay quiet.
write_ledger() {
  local key=$1 first=$2 last=$3 runs=$4
  printf '%s %s %s %s\n' "$key" "$first" "$last" "$runs" >"$NOTIFY_STATE.tmp" 2>/dev/null &&
    mv "$NOTIFY_STATE.tmp" "$NOTIFY_STATE" 2>/dev/null
}

clear_ledger() {
  rm -f "$NOTIFY_STATE" 2>/dev/null || true
}

# GitHub states the expiry as `2026-10-21 02:07:04 UTC`. GNU date reads that
# with -d and BSD date cannot, so both are tried: Unraid is GNU, and this file
# is also run on a Mac under test, where a silent skip would make the expiry
# warning look tested when it never ran.
parse_date() {
  local s=$1 out
  if out=$(date -d "$s" +%s 2>/dev/null) && [ -n "$out" ]; then
    printf '%s' "$out"
    return 0
  fi
  if out=$(TZ=UTC date -j -f '%Y-%m-%d %H:%M:%S' "${s% UTC}" +%s 2>/dev/null) && [ -n "$out" ]; then
    printf '%s' "$out"
    return 0
  fi
  return 1
}

human_age() {
  local secs=$1 days hours
  days=$((secs / 86400))
  hours=$(((secs % 86400) / 3600))
  if [ "$days" -gt 0 ]; then
    printf '%sd %sh' "$days" "$hours"
  else
    printf '%sh' "$hours"
  fi
}

# DMs about an ongoing condition at most once per outage, plus one reminder per
# REMIND_AFTER while it is still broken. Everything it decides NOT to send is
# still logged, so the log stays a complete record and only the DM is rationed.
notify_once() {
  local key=$1 text=$2 now age due
  # Without --notify there is no notification, so there is nothing to record.
  # Writing the ledger here would let a hand-run of the script eat the DM that
  # the next cron run owed Lacy.
  [ "$NOTIFY" = "1" ] || return 0
  now=$(date +%s)
  read_ledger

  if [ "$ledger_key" != "$key" ]; then
    # A different condition, or the first run of this one. Always DMs.
    if ! write_ledger "$key" "$now" "$now" 1; then
      loud "cannot write the notify ledger $NOTIFY_STATE; every run of this outage will DM"
    fi
    notify "$text" || true
    return 0
  fi

  ledger_runs=$((ledger_runs + 1))
  age=$((now - ledger_first))
  due=$((now - ledger_last))
  if [ "$due" -ge "$REMIND_AFTER" ]; then
    write_ledger "$key" "$ledger_first" "$now" "$ledger_runs" || true
    notify "$text (still unfixed after $(human_age "$age"), $ledger_runs runs; reminding once a week)" || true
  else
    write_ledger "$key" "$ledger_first" "$ledger_last" "$ledger_runs" || true
    log "already reported [$key] $(human_age "$age") ago, run $ledger_runs; next reminder in $(human_age $((REMIND_AFTER - due)))"
  fi
}

# The other edge of the same state: say it once when it starts working again.
notify_recovered() {
  local now age
  [ "$NOTIFY" = "1" ] || return 0
  read_ledger
  [ -n "$ledger_key" ] || return 0
  # An expiry warning is NOT an outage to recover from, and it is recorded on a
  # run that succeeded, so it has to survive this. Clearing it first would wipe
  # the record of having warned and the warning would go out again every day.
  case "$ledger_key" in
    token-expiring) return 0 ;;
  esac
  now=$(date +%s)
  age=$((now - ledger_first))
  clear_ledger
  notify "GitHub mirror on library is working again, after $(human_age "$age") of [$ledger_key]" || true
}

# `exit 2` is "could not look", and it is never allowed to read as success.
cannot_run() {
  loud "MIRROR-BROKEN $2"
  notify_once "$1" "GitHub mirror on library could not run: $2"
  rotate_log
  exit 2
}

failed() {
  loud "MIRROR-FAILED $2"
  notify_once "$1" "GitHub mirror on library failed: $2"
  rotate_log
  exit 1
}

for dep in git curl jq date; do
  command -v "$dep" >/dev/null 2>&1 ||
    cannot_run dep-missing "needs $dep and it is not on PATH"
done

mkdir -p "$(dirname "$LOG")" 2>/dev/null
[ -w "$(dirname "$LOG")" ] ||
  cannot_run log-unwritable "cannot write the log directory $(dirname "$LOG")"

TOKEN=$(tr -d ' \t\n\r' <"$TOKEN_FILE" 2>/dev/null)
[ -n "$TOKEN" ] ||
  cannot_run token-missing "no GitHub token in $TOKEN_FILE"

mkdir -p "$MIRROR" 2>/dev/null
[ -w "$MIRROR" ] ||
  cannot_run mirror-unwritable "cannot write the mirror directory $MIRROR"

log "=== mirror refresh start ==="

# --- discovery -------------------------------------------------------------
#
# Three affiliations, because a repo Lacy only collaborates on is just as
# unbacked-up as one he owns. The old version parsed the body with grep and
# ignored the status line, so a 401 produced an empty list, the loop below ran
# zero times, and the run logged "refresh done" and exited 0. That is how a dead
# token looked identical to a healthy backup for 88 days.
repos=""
token_expires=""
for affiliation in owner collaborator organization_member; do
  page=1
  while :; do
    body=$(mktemp) || cannot_run tmp-unwritable "cannot create a temp file"
    headers=$(mktemp) || cannot_run tmp-unwritable "cannot create a temp file"
    http=$(curl -sS -m "$CURL_TIMEOUT" -o "$body" -D "$headers" -w '%{http_code}' \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Accept: application/vnd.github+json' \
      "$API/user/repos?per_page=100&affiliation=$affiliation&page=$page" 2>>"$LOG")
    # GitHub states a PAT's expiry on every authenticated response. Capture it
    # once, from the headers we are already fetching, and check it after the
    # mirror is done: a looming expiry is never a reason to skip a backup.
    if [ -z "$token_expires" ]; then
      token_expires=$(sed -n 's/^[Gg][Ii][Tt][Hh][Uu][Bb]-[Aa]uthentication-[Tt]oken-[Ee]xpiration: *//p' \
        "$headers" | tr -d '\r' | head -n 1)
    fi
    rm -f "$headers"
    if [ "$http" != "200" ]; then
      # One line, so the timestamp stays attached to the reason: GitHub pretty-
      # prints its error bodies across four lines.
      message=$(head -c 400 "$body" | tr '\n\t' '  ' | tr -s ' ')
      rm -f "$body"
      # The http code is in the key, not just the message: a 401 that becomes a
      # 403 or a 500 is a different outage and has to break the silence.
      failed "api-http-$http" "GitHub answered http=$http for affiliation=$affiliation page=$page: $message"
    fi
    names=$(jq -r 'if type == "array" then .[].full_name else empty end' "$body" 2>/dev/null)
    count=$(jq -r 'if type == "array" then length else -1 end' "$body" 2>/dev/null)
    rm -f "$body"
    [ "$count" = "-1" ] &&
      failed api-malformed "GitHub returned something that is not a repo list for affiliation=$affiliation page=$page"
    [ "$count" = "0" ] && break
    repos="$repos$names"$'\n'
    [ "$count" -lt 100 ] && break
    page=$((page + 1))
  done
done

repos=$(printf '%s' "$repos" | grep -v '^$' | sort -u)
# `wc -l` on an empty string answers 1, which is how the old version reported
# "discovered 1 repos" while holding none.
total=$(printf '%s' "$repos" | grep -c '^' || true)
[ "$total" -gt 0 ] ||
  failed api-empty "GitHub returned no repositories at all, which is never right for this account"

log "discovered $total repos"

# --- mirror ----------------------------------------------------------------
#
# The token lives in the remote URL only for the length of one fetch and is
# written back to the clean URL straight after, so a readable config on the
# Backup share never holds a credential. The trap covers the abnormal exits.
scrub_remote() {
  local dest=$1 full=$2
  git --git-dir="$dest" remote set-url origin "$GIT_HOST/$full.git" 2>/dev/null || true
}
current_dest=""
current_full=""
# shellcheck disable=SC2329  # invoked by the trap on the next line but one
cleanup() {
  [ -n "$current_dest" ] && scrub_remote "$current_dest" "$current_full"
}
trap cleanup EXIT INT TERM

failures=0
updated=0
cloned=0
while IFS= read -r full; do
  [ -z "$full" ] && continue
  dest="$MIRROR/$full.git"
  if [ "$GIT_HOST" = "https://github.com" ]; then
    auth="https://x-access-token:$TOKEN@github.com/${full}.git"
  else
    # Tests point GIT_HOST at a local path, which carries no credential.
    auth="$GIT_HOST/$full.git"
  fi
  current_dest="$dest"
  current_full="$full"
  if [ -d "$dest" ]; then
    git --git-dir="$dest" remote set-url origin "$auth" 2>/dev/null
    if output=$(git --git-dir="$dest" remote update --prune 2>&1); then
      updated=$((updated + 1))
    else
      failures=$((failures + 1))
      loud "FETCH-FAILED $full: $(printf '%s' "$output" | tail -n 2 | tr '\n' ' ')"
    fi
    scrub_remote "$dest" "$full"
  else
    mkdir -p "$(dirname "$dest")"
    if output=$(git clone --mirror --quiet "$auth" "$dest" 2>&1); then
      cloned=$((cloned + 1))
      scrub_remote "$dest" "$full"
    else
      failures=$((failures + 1))
      loud "CLONE-FAILED $full: $(printf '%s' "$output" | tail -n 2 | tr '\n' ' ')"
      # git usually removes its own partial clone. If it did not, the leftover
      # would be read as a present mirror on every later run and fetched into
      # forever, so an unfinished directory (no HEAD) goes. A complete one is
      # never touched here.
      if [ -d "$dest" ] && [ ! -f "$dest/HEAD" ]; then rm -rf "$dest"; fi
    fi
  fi
  current_dest=""
  current_full=""
done <<<"$repos"

on_disk=$(find "$MIRROR" -maxdepth 3 -name '*.git' -type d 2>/dev/null | grep -c '^' || true)

if [ "$failures" -gt 0 ]; then
  failed fetch-failures "$failures of $total repos did not mirror ($updated updated, $cloned cloned, $on_disk on disk)"
fi

log "=== refresh done: $updated updated, $cloned cloned, $on_disk repos on disk ==="

# The run worked, so whatever Lacy was last told about is over. This clears the
# ledger as well as sending, so the next outage is a first outage again.
notify_recovered

# --- credential expiry ------------------------------------------------------
#
# A fine-grained PAT dies on a date GitHub picked, and when it dies this script
# fails every day until someone replaces it. That is what happened in July 2026.
# The warning rides the same once-a-week ledger as a failure, so the fortnight
# before an expiry costs about two DMs, against a dead backup plus daily noise.
if [ -n "$token_expires" ]; then
  log "token expires $token_expires"
  # A warning that cannot be computed must never fail a backup that just
  # succeeded, so an unparseable date only costs the log line above.
  if expires_epoch=$(parse_date "$token_expires"); then
    left=$((expires_epoch - $(date +%s)))
    if [ "$left" -le $((EXPIRY_WARN_DAYS * 86400)) ]; then
      loud "TOKEN-EXPIRING in $(human_age "$left") ($token_expires)"
      notify_once token-expiring \
        "GitHub mirror on library: the token expires in $(human_age "$left") ($token_expires). Replace it before then or the backup stops and stays stopped."
    fi
  fi
else
  log "token expiry not stated by GitHub (not a fine-grained PAT, or no expiry set)"
fi

rotate_log
exit 0
