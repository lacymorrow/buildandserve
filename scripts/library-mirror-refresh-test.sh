#!/usr/bin/env bash
# Counts the Slack DMs the refresh script sends across a scripted outage.
# Arm 0 runs the UNPATCHED script so the harness proves it can see the old
# noise; if arm 0 is quiet the harness is wrong, not the fix.
set -uo pipefail
cd "$(dirname "$0")" || exit 2

PORT=${PORT:-8731}
ROOT=$(mktemp -d)
CTL="$ROOT/ctl"
mkdir -p "$CTL" "$ROOT/state" "$ROOT/mirror" "$ROOT/host/t"

python3 library-mirror-refresh-stub.py "$PORT" "$CTL" &
STUB=$!
trap 'kill $STUB 2>/dev/null; rm -rf "$ROOT"' EXIT
for _ in $(seq 40); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/user/repos?affiliation=owner&page=1" && break
  sleep 0.1
done

# Real commits, so "it mirrored" means refs arrived rather than two empty
# directories. No -c user.email here: fleet rule 18's guard rejects an identity
# override, and the ambient identity is fine for a throwaway repo.
for r in alpha beta; do
  git init -q --bare "$ROOT/host/t/$r.git"
  w=$(mktemp -d)
  git -C "$w" init -q
  git -C "$w" commit -q --allow-empty -m init
  git -C "$w" push -q "$ROOT/host/t/$r.git" HEAD:refs/heads/main
  rm -rf "$w"
done

printf 'dummy-token\n' >"$ROOT/state/.token"
printf 'slack-token\n' >"$ROOT/slack-token"

export LIBRARY_MIRROR_STATE_DIR="$ROOT/state"
export LIBRARY_MIRROR_DIR="$ROOT/mirror"
export LIBRARY_MIRROR_API="http://127.0.0.1:$PORT"
export LIBRARY_MIRROR_GIT_HOST="$ROOT/host"
export LIBRARY_MIRROR_SLACK_API="http://127.0.0.1:$PORT/chat.postMessage"
export LIBRARY_MIRROR_SLACK_TOKEN_FILE="$ROOT/slack-token"
export LIBRARY_MIRROR_TOKEN_FILE="$ROOT/state/.token"

mode() { printf '%s\n' "$1" >"$CTL/MODE"; }
expires() { printf '%s\n' "${1:-}" >"$CTL/EXPIRES"; }
# `ok` accepts the DM, `reject` answers Slack's own ok:false. A rejected send
# is still counted as an attempt, so an arm can separate a refusal from silence.
slack() { printf '%s\n' "${1:-ok}" >"$CTL/SLACK"; }
# `grep -c` prints 0 AND exits 1 on no match, so a `|| echo 0` fallback here
# prints a second zero and every "expect 0" arm compares against "0\n0".
dms() {
  if [ -f "$CTL/dms" ]; then wc -l <"$CTL/dms" | tr -d ' '; else printf '0'; fi
}
attempts() {
  if [ -f "$CTL/attempts" ]; then wc -l <"$CTL/attempts" | tr -d ' '; else printf '0'; fi
}
ledger() { if [ -f "$ROOT/state/notify-state" ]; then printf 'present'; else printf 'absent'; fi; }
reset_dms() {
  : >"$CTL/dms"
  : >"$CTL/attempts"
}

PASS=0
FAIL=0
check() {
  local label=$1 want=$2 got=$3
  if [ "$want" = "$got" ]; then
    printf '  PASS  %-58s got %s\n' "$label" "$got"
    PASS=$((PASS + 1))
  else
    printf '  FAIL  %-58s want %s got %s\n' "$label" "$want" "$got"
    FAIL=$((FAIL + 1))
  fi
}

run() { bash "$1" --notify >/dev/null 2>&1; }

# ---------------------------------------------------------------- arm 0 control
printf '\nARM 0  control: the unpatched script on an unchanging 401\n'
slack ok
mode 401
expires ""
reset_dms
rm -f "$ROOT/state/notify-state" "$ROOT/state/refresh.log"
for _ in 1 2 3; do run library-mirror-refresh-pre-laca2947.sh; done
check "3 identical failures DM 3 times (the reported defect)" 3 "$(dms)"

# ---------------------------------------------------------------- the fix
printf '\nARM 1  one DM per outage\n'
mode 401
reset_dms
rm -f "$ROOT/state/notify-state" "$ROOT/state/refresh.log"
run library-mirror-refresh.sh
check "first 401 DMs" 1 "$(dms)"
reset_dms
run library-mirror-refresh.sh
run library-mirror-refresh.sh
run library-mirror-refresh.sh
check "next three identical 401s stay quiet" 0 "$(dms)"

printf '\nARM 2  a DIFFERENT failure still breaks the silence\n'
reset_dms
mode 500
run library-mirror-refresh.sh
check "401 -> 500 is a new outage and DMs" 1 "$(dms)"
reset_dms
run library-mirror-refresh.sh
check "second 500 stays quiet" 0 "$(dms)"
reset_dms
mode empty
run library-mirror-refresh.sh
check "500 -> empty repo list DMs" 1 "$(dms)"
reset_dms
mode malformed
run library-mirror-refresh.sh
check "empty -> malformed body DMs" 1 "$(dms)"

printf '\nARM 3  the weekly reminder\n'
mode 401
reset_dms
rm -f "$ROOT/state/notify-state"
run library-mirror-refresh.sh
reset_dms
run library-mirror-refresh.sh
check "quiet inside the reminder window" 0 "$(dms)"
reset_dms
LIBRARY_MIRROR_REMIND_AFTER=0 run library-mirror-refresh.sh
check "reminder fires once the window passes" 1 "$(dms)"
reset_dms
run library-mirror-refresh.sh
check "window restarts after the reminder" 0 "$(dms)"

printf '\nARM 4  recovery\n'
mode ok
reset_dms
run library-mirror-refresh.sh
check "the run that works again DMs once" 1 "$(dms)"
reset_dms
run library-mirror-refresh.sh
check "staying healthy is silent" 0 "$(dms)"
reset_dms
mode 401
run library-mirror-refresh.sh
check "a new outage after recovery DMs again" 1 "$(dms)"

printf '\nARM 5  a hand-run must not eat the cron DM\n'
mode 401
rm -f "$ROOT/state/notify-state"
reset_dms
bash library-mirror-refresh.sh >/dev/null 2>&1
check "run WITHOUT --notify sends nothing" 0 "$(dms)"
reset_dms
run library-mirror-refresh.sh
check "the next --notify run still owes the DM" 1 "$(dms)"

printf '\nARM 6  an unwritable ledger fails LOUD, never silent\n'
mode 401
rm -f "$ROOT/state/notify-state"
reset_dms
LIBRARY_MIRROR_NOTIFY_STATE="$ROOT/state/nope/notify-state" run library-mirror-refresh.sh
LIBRARY_MIRROR_NOTIFY_STATE="$ROOT/state/nope/notify-state" run library-mirror-refresh.sh
check "no ledger means every run DMs" 2 "$(dms)"
reset_dms
rm -f "$ROOT/state/notify-state"
printf 'garbage not a ledger\n' >"$ROOT/state/notify-state"
run library-mirror-refresh.sh
check "a corrupt ledger is read as no record, so it DMs" 1 "$(dms)"

printf '\nARM 7  token expiry warns before the credential dies\n'
mode ok
rm -f "$ROOT/state/notify-state"
reset_dms
expires "$(date -u -v+90d '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || date -u -d '+90 days' '+%Y-%m-%d %H:%M:%S UTC')"
run library-mirror-refresh.sh
check "a far-off expiry is silent" 0 "$(dms)"
reset_dms
expires "$(date -u -v+5d '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || date -u -d '+5 days' '+%Y-%m-%d %H:%M:%S UTC')"
run library-mirror-refresh.sh
check "an expiry inside 14 days DMs once" 1 "$(dms)"
reset_dms
run library-mirror-refresh.sh
check "it does not repeat that warning daily" 0 "$(dms)"
reset_dms
mode 401
run library-mirror-refresh.sh
check "a real outage still DMs over a held expiry warning" 1 "$(dms)"
reset_dms
mode ok
expires "$(date -u -v+5d '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || date -u -d '+5 days' '+%Y-%m-%d %H:%M:%S UTC')"
run library-mirror-refresh.sh
check "recovery DM, and the expiry warning re-arms behind it" 2 "$(dms)"
reset_dms
expires ""
run library-mirror-refresh.sh
check "no expiry header at all is silent, not a crash" 0 "$(dms)"

printf '\nARM 8  a healthy run still actually mirrors\n'
mode ok
expires ""
rm -rf "$ROOT/mirror"
mkdir -p "$ROOT/mirror"
rm -f "$ROOT/state/notify-state"
bash library-mirror-refresh.sh >/dev/null 2>&1
rc=$?
n=$(find "$ROOT/mirror" -maxdepth 3 -name '*.git' -type d | grep -c '^')
check "exit 0 on a good run" 0 "$rc"
check "both repos are on disk (count, not DMs)" 2 "$n"

printf '\nARM 9  a DM Slack refuses must not dedup the outage\n'
mode 401
expires ""
slack reject
rm -f "$ROOT/state/notify-state" "$ROOT/state/refresh.log"
reset_dms
run library-mirror-refresh.sh
run library-mirror-refresh.sh
run library-mirror-refresh.sh
check "three refused sends deliver nothing" 0 "$(dms)"
check "but the script tried on every one of the three runs" 3 "$(attempts)"
check "a refused DM is not filed as told him" absent "$(ledger)"
slack ok
reset_dms
run library-mirror-refresh.sh
check "the first run after Slack recovers delivers it" 1 "$(dms)"
check "and files the outage once it is actually delivered" present "$(ledger)"
reset_dms
run library-mirror-refresh.sh
run library-mirror-refresh.sh
check "deduped from then on, not one DM per run" 0 "$(dms)"
check "and it stopped trying, too" 0 "$(attempts)"

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
