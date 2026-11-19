#!/usr/bin/env bash
#
# Installs the Slack DM send gate onto a host (LAC-8649).
#
# Why an installer instead of an edit. Five of the thirteen senders reach Lacy's
# DM through `~/.openclaw/scripts/slack-post.sh`, which is not in any repo: it is
# an unversioned file on zero and, separately, on graphite. Editing it by hand
# leaves no reviewable artifact and no way to prove the two hosts match. This
# script is the artifact. It is tested in `tests/node/ops/slack-send-gate.test.ts`
# against fixture copies, it is idempotent, and it keeps one backup per file in
# the `.bak-` convention the rest of `~/.paperclip` already uses.
#
# What it does:
#   1. Copies `slack-send-gate.sh` next to `slack-post.sh`.
#   2. Adds `--sender <id>` to `slack-post.sh` and runs the gate before the POST.
#   3. Threads `--sender` through the host-local callers.
#
# Step 3 is not cosmetic. Without an id every caller pools under `adhoc`, whose
# declared ceiling is 25, and `usage-governor.py` alone sent 93 DMs in its
# busiest measured week. Tagging is the difference between a ceiling that holds
# per sender and one that gags the channel on day one. Two further callers live
# in `~/repo/marketing-videos` and are changed in that repo, not from here.
#
# Where the gate check goes, and why it is not at the top of slack-post.sh. That
# file has a duplicate guard which exits 0 without posting when the same text is
# already in the channel. If the gate ran before it, a skipped duplicate would
# be booked as a send and would eat the sender's weekly allowance for a message
# Slack never saw. So the gate runs after the duplicate guard, before the POST.
#
# Usage:
#   slack-send-gate-install.sh                     # install to ~/.openclaw/scripts
#   SLACK_GATE_INSTALL_DIR=/some/dir ...           # install the gate elsewhere
#   SLACK_GATE_CALLER_HOME=/some/home ...          # look for callers elsewhere
#   slack-send-gate-install.sh --check             # report, change nothing
#
# Exit codes: 0 fully installed, 1 something could not be patched and is named on
# stderr, 2 usage. A caller that could not be patched keeps sending, as `adhoc`.

set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
GATE_SRC="$HERE/slack-send-gate.sh"
TARGET_DIR="${SLACK_GATE_INSTALL_DIR:-$HOME/.openclaw/scripts}"
CALLER_HOME="${SLACK_GATE_CALLER_HOME:-$HOME}"
POST="$TARGET_DIR/slack-post.sh"
MARKER="# --- LAC-8649 slack DM send gate ---"
CHECK_ONLY=0

case "${1-}" in
  --check) CHECK_ONLY=1 ;;
  "") ;;
  *) printf 'slack-send-gate-install.sh: unknown argument: %s\n' "$1" >&2; exit 2 ;;
esac

[ -r "$GATE_SRC" ] || { printf 'no gate at %s\n' "$GATE_SRC" >&2; exit 1; }
[ -r "$POST" ] || { printf 'no slack-post.sh at %s\n' "$POST" >&2; exit 1; }

# --- step 1 and 2: the gate, and slack-post.sh ------------------------------

patch_slack_post() {
  local tmp="$POST.lac8649.$$"
  cp "$POST" "$POST.bak-lac8649-$(date +%Y%m%d-%H%M%S)"

  # awk rather than `sed -i`: BSD and GNU sed disagree about -i, and this file
  # has to run the same way on both Macs.
  awk -v marker="$MARKER" '
    # 1. the new flag, immediately before the catch-all arm, so that arm stays
    #    last and keeps rejecting typos
    /^    \*\) echo "slack-post.sh: unknown argument/ && !flag {
      print "    --sender)     SENDER=\"$2\"; shift 2 ;;"
      flag = 1
    }
    # 2. the variable, on the line that declares the others
    /^CHANNEL=""; THREAD=""; TEXT=""/ && !decl {
      print $0 "; SENDER=\"\""
      decl = 1
      next
    }
    # 3. the gate, immediately before the payload is built and posted
    /^PAYLOAD=\$\(jq -n/ && !gate {
      print marker
      print "# Five senders reach Lacy'\''s DM through this file and seven more post"
      print "# directly, so the policy lives in a library both can source rather than"
      print "# in a wrapper here. Absent library means send: a host this was never"
      print "# installed on degrades to the old behaviour, not to silence."
      print "for _slack_gate_lib in \"${SLACK_GATE_LIB:-}\" \"$(dirname \"$0\")/slack-send-gate.sh\" \"$HOME/.openclaw/scripts/slack-send-gate.sh\"; do"
      print "  [ -n \"$_slack_gate_lib\" ] && [ -r \"$_slack_gate_lib\" ] && { . \"$_slack_gate_lib\"; break; }"
      print "done"
      print "command -v slack_gate_allows >/dev/null 2>&1 || slack_gate_allows() { return 0; }"
      print "# A dry run previews the verdict and books nothing."
      print "[ \"$DRY\" -eq 1 ] && SLACK_GATE_RECORD=0"
      print "if ! slack_gate_allows \"${SENDER:-adhoc}\" \"$TEXT\" \"$CHANNEL\"; then"
      print "  case \"${SLACK_GATE_LAST_DECISION:-}\" in"
      print "    suppressed_ceiling) exit 11 ;;"
      print "    *) exit 10 ;;"
      print "  esac"
      print "fi"
      print marker " end"
      print ""
      gate = 1
    }
    { print }
    END {
      if (!flag || !decl || !gate) {
        printf("slack-send-gate-install.sh: slack-post.sh does not look like the file this patch was written for (flag=%d decl=%d gate=%d)\n", flag, decl, gate) > "/dev/stderr"
        exit 1
      }
    }
  ' "$POST" > "$tmp" || { rm -f "$tmp"; printf 'patch refused, %s untouched\n' "$POST" >&2; return 1; }

  # Refuse to install a file bash cannot parse. Without this a bad patch takes
  # out every alert on the host, which is the opposite of the point.
  if ! bash -n "$tmp"; then
    rm -f "$tmp"
    printf 'patched slack-post.sh does not parse, %s untouched\n' "$POST" >&2
    return 1
  fi

  chmod 755 "$tmp"
  mv -f "$tmp" "$POST"
  printf 'installed: %s\n' "$POST"
}

# --- step 3: threading --sender through the host-local callers --------------

# One exact-string substitution, verified. A caller whose anchor has moved is
# reported loudly and left alone: it keeps sending, pooled under `adhoc`, which
# is the fail-open direction. Silently tagging nothing is the failure that would
# let a ceiling gag the governor without anybody knowing why.
patch_caller() {
  local file=$1 sender=$2 find=$3 repl=$4
  if [ ! -r "$file" ]; then printf 'skip, not on this host: %s\n' "$file"; return 0; fi
  if grep -qF -- "$repl" "$file"; then printf 'already tagged %s as %s\n' "$file" "$sender"; return 0; fi
  if ! grep -qF -- "$find" "$file"; then
    printf 'CANNOT TAG %s as %s: anchor moved, it keeps sending as adhoc\n' "$file" "$sender" >&2
    return 1
  fi
  ls "$file".bak-lac8649-* >/dev/null 2>&1 || cp "$file" "$file.bak-lac8649-$(date +%Y%m%d-%H%M%S)"
  FIND="$find" REPL="$repl" python3 -I -c '
import os, sys
path = sys.argv[1]
body = open(path).read()
find, repl = os.environ["FIND"], os.environ["REPL"]
if body.count(find) != 1:
    sys.exit(f"{path}: anchor matched {body.count(find)} times, expected 1")
open(path, "w").write(body.replace(find, repl))
' "$file" || { printf 'patch refused, %s untouched\n' "$file" >&2; return 1; }
  printf 'tagged %s as %s\n' "$file" "$sender"
}

tag_callers() {
  local failed=0

  # 178 DMs in 30 days, 32% of the whole channel, 93 of them in one week.
  patch_caller "$CALLER_HOME/.paperclip/scripts/usage-governor.py" usage-governor \
    '[str(SLACK_POST), "-c", SLACK_DM, "-m", msg]' \
    '[str(SLACK_POST), "-c", SLACK_DM, "--sender", "usage-governor", "-m", msg]' || failed=1

  patch_caller "$CALLER_HOME/.paperclip/scripts/lacy-qa-ping.sh" lacy-qa-ping \
    '"$HOME/.openclaw/scripts/slack-post.sh" -c "$LACY_SLACK" --force $DRY' \
    '"$HOME/.openclaw/scripts/slack-post.sh" -c "$LACY_SLACK" --sender lacy-qa-ping --force $DRY' || failed=1

  # Two call sites, one sender. `slack_alert` posts to #dev, which the gate
  # passes through ungated; `lacy_dm` is the DM. Both tagged, so the record
  # attributes them to the same sender wherever they land.
  patch_caller "$CALLER_HOME/.paperclip/fleet-health-check.sh" fleet-health-check \
    '"$SLACK_POST" -c "$SLACK_CHANNEL" -m "$1"' \
    '"$SLACK_POST" -c "$SLACK_CHANNEL" --sender fleet-health-check -m "$1"' || failed=1

  patch_caller "$CALLER_HOME/.paperclip/fleet-health-check.sh" fleet-health-check \
    '"$SLACK_POST" -c "$LACY_DM" -m "$1"' \
    '"$SLACK_POST" -c "$LACY_DM" --sender fleet-health-check -m "$1"' || failed=1

  return "$failed"
}

# --- run --------------------------------------------------------------------

if grep -q "$MARKER" "$POST"; then
  printf 'already installed: %s\n' "$POST"
  # The gate itself is still refreshed, because the policy changes more often
  # than the patch does and a stale gate beside a patched sender is the one
  # failure this script exists to prevent. Tagging still runs: a reinstall has
  # to be able to pick up a caller the first run could not reach.
  if [ "$CHECK_ONLY" -eq 0 ]; then
    cp "$GATE_SRC" "$TARGET_DIR/slack-send-gate.sh"
    chmod 755 "$TARGET_DIR/slack-send-gate.sh"
  fi
elif [ "$CHECK_ONLY" -eq 1 ]; then
  printf 'NOT installed: %s\n' "$POST"
else
  cp "$GATE_SRC" "$TARGET_DIR/slack-send-gate.sh"
  chmod 755 "$TARGET_DIR/slack-send-gate.sh"
  patch_slack_post || exit 1
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  for f in "$CALLER_HOME/.paperclip/scripts/usage-governor.py" \
           "$CALLER_HOME/.paperclip/scripts/lacy-qa-ping.sh" \
           "$CALLER_HOME/.paperclip/fleet-health-check.sh"; do
    if [ ! -r "$f" ]; then printf 'absent: %s\n' "$f"
    elif grep -qF -- '--sender' "$f"; then printf 'tagged: %s\n' "$f"
    else printf 'UNTAGGED: %s\n' "$f"; fi
  done
  exit 0
fi

tag_callers || {
  printf 'at least one caller could not be tagged; it still sends, as adhoc\n' >&2
  exit 1
}
