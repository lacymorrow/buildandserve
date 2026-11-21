#!/usr/bin/env bash
#
# The Slack DM send gate (LAC-8649, from the CEO's decision 1 on LAC-8640).
#
# Two rules, one file, reachable from every sender on every host:
#
#   1. A content floor. Nothing under 40 characters of actual content reaches
#      Lacy's DM. This is the measured defect class: 15 byte-identical DMs
#      reading `Post queue 2026-11-18:$`, 23 characters, which `slack-post.sh`'s
#      `[ -z "$TEXT" ]` could never catch because the string is not empty.
#   2. A per-sender weekly ceiling. Over its declared ceiling a sender is
#      suppressed, and the suppression becomes a line the Sunday digest reads.
#
# Why 40. Measured 2026-11-19 over 30 days of `conversations.history` on
# `D0A77QE1B9V`, bot `U0A7P7VKM18`, 558 subtype-less DMs:
#
#     0 chars        0
#     1-23          15   <- all 15 the defect, byte-identical
#     24-72          0   <- nothing at all, in thirty days
#     73-119        14   <- shortest legitimate DM is 73 chars
#     120+         529
#
# So any floor in 24..72 kills all 15 and no legitimate alert. 40 sits 17 above
# the longest defect and 33 below the shortest real one. The band held at 5x the
# sample of the 7-day window the decision was written from.
#
# A floor is not a content test. `Post queue: nothing to do today, all quiet` is
# 42 characters and says nothing. The per-sender content guard already shipped at
# `post-queue.sh:103` stays the real answer and belongs in each sender; this
# floor catches the measured class and nothing more. Do not let it be used as an
# argument against the per-sender guard.
#
# Why this is a sourceable library and not a wrapper on zero. There is no shared
# send path. Five senders go through `~/.openclaw/scripts/slack-post.sh`; seven
# call `chat.postMessage` with their own token, and two of those run from cron on
# `library` precisely so they do not die with the Mac they watch
# (`fleet-dark-watch.sh`, `library-mirror-refresh.sh`). Routing them through a
# script on zero would reintroduce the single dependency `fleet-dark-watch`
# exists to avoid. So the policy is one file, installed per host, and every
# sender stubs `slack_gate_allows` to a no-op if the file is not there.
#
# Usage, sourced (the five bash senders):
#   . /path/to/slack-send-gate.sh
#   slack_gate_allows <sender-id> "$text" "$channel" || return 0
#
# Usage, executed (the three TypeScript watchers, and operators):
#   printf '%s' "$text" | slack-send-gate.sh --check <sender-id> <channel>
#   slack-send-gate.sh --registry      # sender<TAB>ceiling<TAB>measured-peak
#   slack-send-gate.sh --ceiling <id>  # the number this sender is held to
#   slack-send-gate.sh --floor
#   slack-send-gate.sh --window        # how to label a count: rolling 7d, per host
#
# Exit codes for --check: 0 send it, 10 dropped by the floor, 11 suppressed by
# the ceiling, 2 bad usage. 0 is also what an unwritable state directory
# returns, on purpose: see "fail open" below.

# No `set -e`. This file is sourced into senders that have their own error
# discipline, and a gate that can abort its caller is a gate that can take an
# outage alarm down with it.

# --- configuration ---------------------------------------------------------

# 40 characters of content. See the measurement above before changing it.
SLACK_GATE_FLOOR="${SLACK_GATE_FLOOR:-40}"

# What an undeclared sender is held to. The CEO's number. A new sender that
# needs more than this declares it in the registry below, in the same change
# that adds the sender.
SLACK_GATE_DEFAULT_CEILING="${SLACK_GATE_DEFAULT_CEILING:-7}"

# Both forms reach the same conversation and both are in live use: the direct
# `chat.postMessage` senders address Lacy by user id, the `slack-post.sh` ones
# by DM channel id.
#
# Scoped deliberately. `tools/launchd-domain-drift/domain-drift-check.sh` posts
# to `#dev` every ten minutes through the same `slack-post.sh`, and the floor's
# number is justified by DM history only. An unmeasured floor on an unmeasured
# channel is how a gate earns a false positive nobody predicted.
SLACK_GATE_DM_CHANNELS="${SLACK_GATE_DM_CHANNELS:-D0A77QE1B9V U3XC80UUQ}"

# Named, not a ceiling of 999. `fleet-dark-watch` is a dead-man's switch: it
# sent 24 DMs in its busiest measured week and a suppressed outage alarm is
# strictly worse than a noisy channel (LAC-5366, where the page was right and
# nobody saw it for eight hours). The floor still applies to it.
SLACK_GATE_EXEMPT="${SLACK_GATE_EXEMPT:-fleet-dark-watch}"

# Where the record lives. `library` has no `~/.paperclip`, so a sender there
# passes its own directory; see the install notes in the README section below.
SLACK_GATE_DIR="${SLACK_GATE_DIR:-$HOME/.paperclip/state/slack-send-gate}"
SLACK_GATE_FALLBACK_DIR="${SLACK_GATE_FALLBACK_DIR:-/tmp/slack-send-gate}"

# How to label a count from this gate, wherever one is printed. One string, in
# one place, because the number is easy to misread in two ways at once: it is a
# rolling seven days and not a calendar week, and it is this host's sends and
# not the fleet's. Read by `--window` and by anything that sources this file.
SLACK_GATE_WINDOW_LABEL="rolling 7d, per host"

# Set to 0 to get the verdict without writing anything, which is what
# `slack-post.sh --dry-run` needs: a dry run that books a send would inflate the
# week it is only previewing.
SLACK_GATE_RECORD="${SLACK_GATE_RECORD:-1}"

# Resolved by slack_gate_resolve_dir. Empty means "not resolved yet".
SLACK_GATE_RESOLVED_DIR=""

# The verdict on the last message: sent, dropped_floor, suppressed_ceiling, or
# ungated (a channel this gate does not police, or a fail-open).
SLACK_GATE_LAST_DECISION=""

# --- the declared-ceiling registry -----------------------------------------
#
# Three columns: sender id, declared ceiling, measured peak week over the 30
# days to 2026-11-19. The peak is carried so the Sunday digest (LAC-8648) can
# print declared against actual, which is the number the CEO said they are
# waiting on before setting any fleet-wide total. Do not invent that total here.
#
# The count is per host, and so is every ceiling below. State lives in
# `$HOME/.paperclip/state/slack-send-gate`, one copy per machine, so a sender
# scheduled on two hosts is held to its declared number twice and the most it
# can send fleet-wide is its ceiling times the hosts it runs on. Measured
# 2026-11-21: `usage-governor` has a launchd job and live `sends.tsv` rows on
# both zero (10) and graphite (1), ceiling 150 on each, so 300 aggregate.
# `fleet-health-check` has a job on both Macs. `lacy-qa-ping` is installed on
# graphite by the fleet-health deploy but has no scheduled caller there, so it
# is single-host in practice and the LAC-8667 ticket text overstated it.
# `fleet-dark-watch` and `library-mirror-refresh` run from cron on `library`, a
# third host with its own state directory.
#
# Not aggregated, on purpose. A shared count needs a store all three hosts can
# write, and the two senders on `library` are there precisely so they do not
# depend on zero (see "Why this is a sourceable library" above). A per-host
# ceiling that is looser than it reads is still a runaway detector; a runaway
# detector that needs the network is not. So the number is documented, not
# centralised, and the label lives in one place: `--window` prints it, so the
# Sunday digest (LAC-8648) cannot drift from the thing it is reporting.
#
# The measured-peak column is the other half of this. It was counted from Slack
# DM history, which is fleet-wide, while the ceiling it sits next to is per
# host. Declared-against-actual is still the right comparison for spotting a
# runaway, but 93 is every host's governor added together and 150 is one host's
# allowance. Do not subtract them and call the difference headroom.
#
# The ceilings are set from the measured peak with headroom, not from the
# decision's "~10/wk" observation, and that is the whole risk this ticket flags.
# Over 30 days the peak weeks were 93, 28, 24, 23, 20, 13, 12, 8, 7, 6, 5. A
# bare default of 7 would not have gagged three senders; it would have gagged
# ten of thirteen, starting with the usage governor at 93 and the outage alarm
# at 24. A ceiling is a runaway detector, not a quota, so each one sits above
# what the sender actually does and the digest reports the gap.
slack_gate_registry() {
  # The usage governor is 178 of 558 DMs in 30 days, 32% of the channel, and 93
  # of them landed in one week. That is the real finding here and 150 is not a
  # defence of it: it is a number high enough not to gag the governor while the
  # digest puts 150-against-93 in front of the CEO every Sunday.
  printf 'usage-governor\t150\t93\n'
  printf 'fleet-dark-watch\texempt\t24\n'
  printf 'fleet-power-watch\t60\t28\n'
  printf 'lacy-qa-ping\t40\t20\n'
  printf 'post-queue\t40\t23\n'
  printf 'fleet-health-check\t30\t13\n'
  printf 'paperclip-stranded-watch\t20\t7\n'
  printf 'tailscale-watchdog\t20\t8\n'
  printf 'library-mirror-refresh\t20\t6\n'
  printf 'doug-store-watch-freshness\t15\t5\n'
  # One-off DMs an agent sends mid-run through `slack-post.sh` with no --sender.
  # 20 of the 29 unattributed DMs in the census are this, peaking at 12 in a
  # week. Pooled under one id on purpose: the alternative is that omitting
  # --sender is a way around the ceiling.
  printf 'adhoc\t25\t12\n'
  # `marketing-videos/tools/juno-demo-rig/tools/notify`, on graphite. This is
  # the "juno-rig line" the census could not attribute, found once graphite
  # answered ssh again.
  printf 'juno-demo-rig\t7\t2\n'
  # Sent nothing in the window. On the bare default until it does.
  printf 'bas-projects-db-watch\t7\t0\n'
}

# The number a sender is actually held to. Always numeric: `exempt` in the
# registry is a column for operators and for the digest, and the exemption
# itself is a separate check, so that removing the exemption cannot silently
# turn into an unbounded ceiling.
slack_gate_ceiling_for() {
  local declared
  declared=$(slack_gate_registry | awk -F'\t' -v s="$1" '$1 == s { print $2; exit }')
  case "$declared" in
    "" | exempt) printf '%s' "$SLACK_GATE_DEFAULT_CEILING" ;;
    *) printf '%s' "$declared" ;;
  esac
}

slack_gate_is_exempt() {
  local one
  for one in $SLACK_GATE_EXEMPT; do
    [ "$one" = "$1" ] && return 0
  done
  return 1
}

slack_gate_is_dm() {
  local one
  # An empty channel gates rather than passes: a caller that did not say where
  # it is posting is not a caller we should assume is posting elsewhere.
  [ -z "$1" ] && return 0
  for one in $SLACK_GATE_DM_CHANNELS; do
    [ "$one" = "$1" ] && return 0
  done
  return 1
}

# --- content length --------------------------------------------------------

# Content, not padding. Whitespace runs collapse to one space and the ends are
# trimmed, so `Post queue 2026-11-18:$` followed by forty newlines is still 23
# characters and still says nothing.
#
# Counted in bytes where the locale is not UTF-8, which over-counts multibyte
# text. That error only ever makes the floor more permissive, so it can turn a
# drop into a send and never a send into a drop.
slack_gate_content_length() {
  local squeezed
  squeezed=$(printf '%s' "$1" \
    | tr '\n\r\t' '   ' \
    | tr -s ' ' \
    | sed -e 's/^ *//' -e 's/ *$//')
  printf '%s' "${#squeezed}"
}

# --- the record the Sunday digest reads ------------------------------------

# Escaped by hand rather than with jq. `fleet-dark-watch.sh` already carries its
# own `json_string` for the same reason: it runs on `library` from cron with a
# nearly empty PATH, and a gate that needs a tool the host might not have is a
# gate that stops recording on the host that most needs it.
slack_gate_json_string() {
  printf '%s' "$1" \
    | tr '\r\t' '  ' \
    | tr -d '\000-\010\013\014\016-\037' \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
    | awk 'BEGIN { ORS = "" } NR > 1 { printf "\\n" } { print }'
}

# Tries the primary directory, then the fallback. Prints nothing; sets
# SLACK_GATE_RESOLVED_DIR and returns non-zero when neither will take a write.
slack_gate_resolve_dir() {
  local candidate
  [ -n "$SLACK_GATE_RESOLVED_DIR" ] && return 0
  for candidate in "$SLACK_GATE_DIR" "$SLACK_GATE_FALLBACK_DIR"; do
    [ -z "$candidate" ] && continue
    mkdir -p "$candidate" 2>/dev/null || continue
    if : > "$candidate/.writable" 2>/dev/null; then
      rm -f "$candidate/.writable" 2>/dev/null
      SLACK_GATE_RESOLVED_DIR="$candidate"
      return 0
    fi
  done
  return 1
}

# One decision, one line of JSON, appended. Dropped and suppressed rows carry
# the text, which is the point: a silent drop on a heuristic gate makes a false
# positive undiscoverable on the one channel Lacy actually reads.
slack_gate_record() {
  local decision="$1" sender="$2" text="$3" chars="$4" count="$5" ceiling="$6"
  local file="$SLACK_GATE_RESOLVED_DIR/decisions.jsonl" kept truncated=false exempt=false
  # A preview books nothing. `slack-post.sh --dry-run` goes through the gate to
  # show the verdict, and a dry run that recorded a send would inflate the very
  # week it is only previewing.
  [ "$SLACK_GATE_RECORD" = "1" ] || return 0
  kept="${text:0:2000}"
  [ "${#kept}" -lt "${#text}" ] && truncated=true
  slack_gate_is_exempt "$sender" && exempt=true
  printf '{"ts":%s,"iso":"%s","host":"%s","sender":"%s","decision":"%s","chars":%s,"count7d":%s,"ceiling":%s,"exempt":%s,"text_truncated":%s,"text":"%s"}\n' \
    "$(date +%s)" \
    "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
    "$(slack_gate_json_string "$(hostname -s 2>/dev/null || printf 'unknown')")" \
    "$(slack_gate_json_string "$sender")" \
    "$decision" \
    "$chars" \
    "$count" \
    "$ceiling" \
    "$exempt" \
    "$truncated" \
    "$(slack_gate_json_string "$kept")" \
    >> "$file" 2>/dev/null
  slack_gate_trim "$file"
}

# Bounded on the same 30-day cutoff as sends.tsv, and for the same reason: every
# refusal appends up to 2KB of message text, and zero reached zero bytes free on
# 2026-11-16. Gated on a line count so the rewrite is not paid per message. The
# ceiling never counts from this file, so trimming it cannot move a verdict.
slack_gate_trim() {
  local file="$1" lines cutoff
  lines=$(wc -l < "$file" 2>/dev/null | tr -d ' ')
  [ -z "$lines" ] && return 0
  [ "$lines" -gt 2000 ] || return 0
  cutoff=$(( $(date +%s) - 30 * 86400 ))
  awk -v c="$cutoff" '
    match($0, /"ts":[0-9]+/) {
      ts = substr($0, RSTART + 5, RLENGTH - 5) + 0
      if (ts >= c) print
      next
    }
    { print }
  ' "$file" > "$file.tmp" 2>/dev/null && mv -f "$file.tmp" "$file" 2>/dev/null
  return 0
}

# A separate, deliberately tiny file for counting. `decisions.jsonl` carries the
# message text and so has to be bounded; if the ceiling counted from it, a
# runaway sender would rotate its own evidence out of the window and the ceiling
# would stop holding exactly when it started mattering.
slack_gate_note_send() {
  local file="$SLACK_GATE_RESOLVED_DIR/sends.tsv" lines cutoff
  [ "$SLACK_GATE_RECORD" = "1" ] || return 0
  printf '%s\t%s\n' "$(date +%s)" "$1" >> "$file" 2>/dev/null
  lines=$(wc -l < "$file" 2>/dev/null | tr -d ' ')
  [ -z "$lines" ] && return 0
  if [ "$lines" -gt 2000 ]; then
    cutoff=$(( $(date +%s) - 30 * 86400 ))
    awk -F'\t' -v c="$cutoff" '$1 + 0 >= c + 0' "$file" > "$file.tmp" 2>/dev/null \
      && mv -f "$file.tmp" "$file" 2>/dev/null
  fi
  return 0
}

# A rolling seven days, not an ISO week. A calendar week has a Monday-midnight
# cliff where a runaway's count resets to zero mid-runaway.
slack_gate_sends_this_week() {
  local file="$SLACK_GATE_RESOLVED_DIR/sends.tsv" cutoff n
  cutoff=$(( $(date +%s) - 7 * 86400 ))
  n=$(awk -F'\t' -v s="$1" -v c="$cutoff" '$1 + 0 >= c + 0 && $2 == s' "$file" 2>/dev/null | wc -l | tr -d ' ')
  printf '%s' "${n:-0}"
}

# --- the gate ---------------------------------------------------------------

# 0 means send it. 1 means do not. Records the decision either way.
slack_gate_allows() {
  local sender="${1:-adhoc}" text="${2-}" channel="${3-}"
  local floor="$SLACK_GATE_FLOOR" ceiling count len
  [ -z "$sender" ] && sender="adhoc"
  # Read by slack_gate_main to pick an exit code, and by any sender that wants
  # to log which of the two refusals happened. Set on every path so a caller can
  # never read a verdict left over from the previous message.
  SLACK_GATE_LAST_DECISION="ungated"

  slack_gate_is_dm "$channel" || return 0

  if ! slack_gate_resolve_dir; then
    printf 'slack-send-gate: no writable state dir (%s, %s): failing open, %s sends ungated\n' \
      "$SLACK_GATE_DIR" "$SLACK_GATE_FALLBACK_DIR" "$sender" >&2
    return 0  # fail open
  fi

  len=$(slack_gate_content_length "$text")
  if [ "$len" -lt "$floor" ]; then
    SLACK_GATE_LAST_DECISION="dropped_floor"
    slack_gate_record "dropped_floor" "$sender" "$text" "$len" 0 "$floor"
    printf 'slack-send-gate: dropped a %s-char message from %s, floor is %s: %s\n' \
      "$len" "$sender" "$floor" "$text" >&2
    return 1
  fi

  if slack_gate_is_exempt "$sender"; then
    SLACK_GATE_LAST_DECISION="sent"
    slack_gate_record "sent" "$sender" "$text" "$len" "$(slack_gate_sends_this_week "$sender")" 0
    slack_gate_note_send "$sender"
    return 0
  fi

  ceiling=$(slack_gate_ceiling_for "$sender")
  count=$(slack_gate_sends_this_week "$sender")
  if [ "$count" -ge "$ceiling" ]; then
    SLACK_GATE_LAST_DECISION="suppressed_ceiling"
    slack_gate_record "suppressed_ceiling" "$sender" "$text" "$len" "$count" "$ceiling"
    printf 'slack-send-gate: suppressed %s, %s sends in 7d against a declared ceiling of %s: %s\n' \
      "$sender" "$count" "$ceiling" "$text" >&2
    return 1
  fi

  SLACK_GATE_LAST_DECISION="sent"
  slack_gate_record "sent" "$sender" "$text" "$len" "$count" "$ceiling"
  slack_gate_note_send "$sender"
  return 0
}

# --- command line -----------------------------------------------------------

slack_gate_main() {
  local text
  case "${1-}" in
    --registry) slack_gate_registry ;;
    --floor) printf '%s\n' "$SLACK_GATE_FLOOR" ;;
    --window) printf '%s\n' "$SLACK_GATE_WINDOW_LABEL" ;;
    --ceiling)
      [ -n "${2-}" ] || { printf 'slack-send-gate.sh: --ceiling needs a sender id\n' >&2; return 2; }
      slack_gate_ceiling_for "$2"
      printf '\n'
      ;;
    --check)
      [ -n "${2-}" ] || { printf 'slack-send-gate.sh: --check needs a sender id\n' >&2; return 2; }
      text=$(cat)
      if slack_gate_allows "$2" "$text" "${3-}"; then
        return 0
      fi
      # Two refusals, two exit codes, because the TypeScript watchers log which
      # one happened and an operator reading a launchd stderr file needs to tell
      # "said nothing" from "said too much". Read from the variable, not from
      # the record file: the verdict has to survive a run that could not record.
      case "$SLACK_GATE_LAST_DECISION" in
        suppressed_ceiling) return 11 ;;
        *) return 10 ;;
      esac
      ;;
    -h | --help | "") sed -n '2,61p' "$0"; return 0 ;;
    *) printf 'slack-send-gate.sh: unknown argument: %s\n' "${1-}" >&2; return 2 ;;
  esac
}

# Sourced by the bash senders, executed by everyone else. `BASH_SOURCE` is set
# in bash 3.2, which is what `/bin/bash` is on both Macs.
if [ "${BASH_SOURCE[0]-}" = "${0}" ]; then
  slack_gate_main "$@"
  exit $?
fi
