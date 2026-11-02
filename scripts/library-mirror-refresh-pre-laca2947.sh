#!/usr/bin/env bash
#
# Mirrors every GitHub repo Lacy can reach onto `library` (LAC-4898).
#
# Runs ON library, from cron, daily at 08:00. It talks to github.com directly so
# the mirror is a directly-restorable backup and the Mac is never in the path.
#
# This file is the master copy. `/boot/config/scripts/library-mirror-refresh.sh`
# on library is a copy of it, and the cron line invokes it through bash:
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
      printf '  --notify   Slack-DM Lacy when the refresh fails.\n'
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

# `exit 2` is "could not look", and it is never allowed to read as success.
cannot_run() {
  loud "MIRROR-BROKEN $1"
  notify "GitHub mirror on library could not run: $1" || true
  rotate_log
  exit 2
}

failed() {
  loud "MIRROR-FAILED $1"
  notify "GitHub mirror on library failed: $1" || true
  rotate_log
  exit 1
}

for dep in git curl jq date; do
  command -v "$dep" >/dev/null 2>&1 ||
    cannot_run "needs $dep and it is not on PATH"
done

mkdir -p "$(dirname "$LOG")" 2>/dev/null
[ -w "$(dirname "$LOG")" ] ||
  cannot_run "cannot write the log directory $(dirname "$LOG")"

TOKEN=$(tr -d ' \t\n\r' <"$TOKEN_FILE" 2>/dev/null)
[ -n "$TOKEN" ] ||
  cannot_run "no GitHub token in $TOKEN_FILE"

mkdir -p "$MIRROR" 2>/dev/null
[ -w "$MIRROR" ] ||
  cannot_run "cannot write the mirror directory $MIRROR"

log "=== mirror refresh start ==="

# --- discovery -------------------------------------------------------------
#
# Three affiliations, because a repo Lacy only collaborates on is just as
# unbacked-up as one he owns. The old version parsed the body with grep and
# ignored the status line, so a 401 produced an empty list, the loop below ran
# zero times, and the run logged "refresh done" and exited 0. That is how a dead
# token looked identical to a healthy backup for 88 days.
repos=""
for affiliation in owner collaborator organization_member; do
  page=1
  while :; do
    body=$(mktemp) || cannot_run "cannot create a temp file"
    http=$(curl -sS -m "$CURL_TIMEOUT" -o "$body" -w '%{http_code}' \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Accept: application/vnd.github+json' \
      "$API/user/repos?per_page=100&affiliation=$affiliation&page=$page" 2>>"$LOG")
    if [ "$http" != "200" ]; then
      # One line, so the timestamp stays attached to the reason: GitHub pretty-
      # prints its error bodies across four lines.
      message=$(head -c 400 "$body" | tr '\n\t' '  ' | tr -s ' ')
      rm -f "$body"
      failed "GitHub answered http=$http for affiliation=$affiliation page=$page: $message"
    fi
    names=$(jq -r 'if type == "array" then .[].full_name else empty end' "$body" 2>/dev/null)
    count=$(jq -r 'if type == "array" then length else -1 end' "$body" 2>/dev/null)
    rm -f "$body"
    [ "$count" = "-1" ] &&
      failed "GitHub returned something that is not a repo list for affiliation=$affiliation page=$page"
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
  failed "GitHub returned no repositories at all, which is never right for this account"

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
  failed "$failures of $total repos did not mirror ($updated updated, $cloned cloned, $on_disk on disk)"
fi

log "=== refresh done: $updated updated, $cloned cloned, $on_disk repos on disk ==="
rotate_log
exit 0
