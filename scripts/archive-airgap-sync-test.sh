#!/usr/bin/env bash
# Harness for archive-airgap-sync.sh (LACA-2951).
#
# Arm 0 runs the PRE-LACA-2951 script against a payload frozen 102 days ago,
# the real condition on library from 2026-07-23, and asserts it reports success.
# If arm 0 ever goes quiet the harness is broken, not the backup.
# archive-airgap-sync-seams.sh proves that arm-0 copy is the live logic.
#
# RUN THIS ON LIBRARY, or any GNU/Linux box. It needs GNU find (-printf, -quit,
# -newermt) and GNU touch (-d @epoch), because the freshness probe the script
# sends to library is a GNU find program. BSD find on a Mac has no -printf and
# no -quit, so a Mac run would exercise a different program than production.
#
#   scp scripts/archive-airgap-sync*.sh root@library:/tmp/t/ \
#     && ssh root@library 'cd /tmp/t && ./archive-airgap-sync-test.sh'
set -uo pipefail
cd "$(dirname "$0")" || exit 2

find --version 2>/dev/null | head -1 | grep -q GNU || {
  echo "This harness needs GNU findutils. Run it on library, not on a Mac."
  exit 2
}
command -v rsync >/dev/null || { echo "needs rsync"; exit 2; }

ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT

CTL="$ROOT/ctl"; export CTL
LIB="$ROOT/lib/mnt/user"
ARC="$ROOT/archive"
BIN="$ROOT/bin"

# $ARC/Unraid, $ARC/GitHubMirror and $ARC/TimeMachine already exist on the real
# archive. rsync creates only the final component of a destination path, so
# without them the mirror leg would fail for a reason the live box never has and
# every arm would be measuring the wrong thing.
mkdir -p "$CTL" "$BIN" "$ROOT/libstate" \
         "$ARC/Unraid" "$ARC/GitHubMirror" "$ARC/TimeMachine"

# --- stand-in for /usr/local/bin/lib-ssh -------------------------------------
# Strips ssh options and the user@host, then runs the rest here. rsync drives it
# too, as `fake-ssh host rsync --server ...`.
cat >"$BIN/fake-ssh" <<'SH'
#!/bin/sh
while [ $# -gt 0 ]; do
  case "$1" in
    -i|-o|-l|-p) shift 2 ;;
    -*) shift ;;
    *) shift; break ;;
  esac
done
CMD="$*"
case "$CMD" in
  true)
    [ -f "$CTL/lib-down" ] && exit 255
    exit 0 ;;
  rsync*) exec sh -c "$CMD" ;;
esac
[ -f "$CTL/probe-broken" ] && exit 255
exec sh -c "$CMD"
SH
chmod +x "$BIN/fake-ssh"

for s in snapshot arm-wol poweroff; do
  printf '#!/bin/sh\nprintf "%%s\\n" "%s" >> "$CTL/calls"\nexit 0\n' "$s" >"$BIN/$s"
  chmod +x "$BIN/$s"
done

LOGF="$ARC/.airgap-sync.log"
STATUSF="$ARC/.airgap-sync-status.tsv"
LIBSTATUSF="$ROOT/libstate/status.tsv"

export AIRGAP_LOG="$LOGF"
export AIRGAP_LIBSSH="$BIN/fake-ssh"
export AIRGAP_LIB_TS=library.invalid
export AIRGAP_LIB_LAN=0.0.0.1           # unroutable, so the LAN fallback fails at once
export AIRGAP_SRC="$LIB"
export AIRGAP_DEST="$ARC"
export AIRGAP_SNAPSHOT="$BIN/snapshot"
export AIRGAP_ARM_WOL="$BIN/arm-wol"
export AIRGAP_POWEROFF="$BIN/poweroff"
export AIRGAP_STATUS="$STATUSF"
export AIRGAP_LIB_STATUS_DIR="$ROOT/libstate"
export AIRGAP_PULL_KEY="$ROOT/no-such-key"

NOW=$(date +%s)
seed() {  # seed <path> <days ago>
  mkdir -p "$(dirname "$1")"
  printf 'payload\n' >"$1"
  touch -d "@$(( NOW - $2 * 86400 ))" "$1"
}

# payload <mirror days> <appdata days> <paperclip days> <timemachine days> <media days>
payload() {
  rm -rf "$ROOT/lib"
  for i in 1 2 3; do seed "$LIB/Backup/github-mirror/repo$i.git/HEAD" "$1"; done
  seed "$LIB/Backup/appdata-backup/appdata.tar.zst" "$2"
  seed "$LIB/Backup/paperclip-laca/dump.sql.gz" "$3"
  seed "$LIB/TimeMachine/Zero.sparsebundle/bands/01" "$4"
  seed "$LIB/Files/doc.txt" "$5"
  seed "$LIB/images/photo.jpg" "$5"
  seed "$LIB/Public/share.txt" "$5"
}

reset_cycle() {
  : >"$LOGF"
  rm -f "$STATUSF" "$LIBSTATUSF" "$CTL/calls" "$CTL/probe-broken" "$CTL/lib-down" "$ARC/.airgap-hold"
}

RC=0
run() { sh "./$1" >"$ROOT/out" 2>&1; RC=$?; }

PASS=0; FAIL=0
check() {  # check <label> <want> <got>
  if [ "$2" = "$3" ]; then
    printf '  PASS  %-62s %s\n' "$1" "$3"
    PASS=$((PASS + 1))
  else
    printf '  FAIL  %-62s want %s got %s\n' "$1" "$2" "$3"
    FAIL=$((FAIL + 1))
  fi
}
has()   { grep -qF -- "$1" "$LOGF" && echo yes || echo no; }
hasre() { grep -qE -- "$1" "$LOGF" && echo yes || echo no; }
n()     { grep -cF -- "$1" "$LOGF" | tr -d ' '; }
# `grep -c` prints 0 AND exits 1 on no match, so a `|| echo 0` tail here prints a
# second zero and every "expect 0" check compares against "0\n0".
calls() {
  if [ -f "$CTL/calls" ]; then grep -cF -- "$1" "$CTL/calls" | tr -d ' \n'; else printf '0'; fi
}
landed(){ find "$1" -type f 2>/dev/null | grep -c '^' | tr -d ' '; }

FIXED=archive-airgap-sync.sh
OLD=archive-airgap-sync-pre-laca2951.sh

###############################################################################
printf '\nARM 0  control: the script as it ran, on a payload frozen 102 days\n'
printf '       (library 2026-07-23 to 2026-11-02: rsync rc=0 twice a week, 200 repos dead)\n'
payload 102 0 0 0 400
reset_cycle
run "$OLD"
check "exits 0 on a dead payload" 0 "$RC"
check "logs the transfer as a success" yes "$(has 'mirror rc=0')"
check "the frozen repos really did copy, so this is a real cycle" 3 "$(landed "$ARC/GitHubMirror/current")"
check "says nothing about freshness" 0 "$(n 'FRESHNESS-FAILED')"
check "reaches no verdict at all" 0 "$(n 'CYCLE-VERDICT')"
check "leaves no status row for anyone to read" no "$([ -f "$STATUSF" ] && echo yes || echo no)"

###############################################################################
printf '\nARM 1  the fix, same frozen payload\n'
payload 102 0 0 0 400
reset_cycle
run "$FIXED"
check "exits non-zero" 1 "$RC"
check "names the stale payload and its age" yes "$(hasre 'STALE +github-mirror .*102d old, floor 2d')"
check "exactly one leg fails" 1 "$(n 'FRESHNESS-FAILED')"
check "cycle verdict is FAIL" yes "$(has 'CYCLE-VERDICT FAIL')"
check "the status row says FAIL and names the leg" yes "$(grep -q 'FAIL' "$STATUSF" && grep -q 'github-mirror=stale:102d' "$STATUSF" && echo yes || echo no)"
check "it still copied: it reports, it does not stop to look" 3 "$(landed "$ARC/GitHubMirror/current")"
check "the live legs are not dragged down with it" yes "$(hasre 'FRESH +appdata-backup')"

###############################################################################
printf '\nARM 2  the fix on a payload that is actually alive\n'
payload 0 0 0 0 400
reset_cycle
run "$FIXED"
check "exits 0" 0 "$RC"
check "cycle verdict is OK" yes "$(has 'CYCLE-VERDICT OK')"
check "no leg fails" 0 "$(n 'FRESHNESS-FAILED')"
check "all four producers read fresh" 4 "$(n 'FRESH ')"

###############################################################################
printf '\nARM 3  control: media at rest must not fail, or the check is a blanket\n'
printf '       (real newest mtimes: images 2022-11-27, Public 2025-05-13)\n'
payload 0 0 0 0 1500
reset_cycle
run "$FIXED"
check "four-year-old media is still a pass" 0 "$RC"
check "and the exemption is stated, not implied" yes "$(has 'at-rest, no floor by design')"

###############################################################################
printf '\nARM 4  the future-mtime trap (one 2107-dated file lives under Backup today)\n'
payload 102 0 0 0 400
seed "$LIB/Backup/github-mirror/SONYCARD.IND" -30000
reset_cycle
naive=$(find "$LIB/Backup/github-mirror" -type f -printf '%T@\n' | sort -rn | head -1)
check "a naive newest-mtime read would call this fresh" yes "$([ "${naive%%.*}" -gt "$NOW" ] && echo yes || echo no)"
run "$FIXED"
check "the fix still calls it stale" yes "$(hasre 'STALE +github-mirror')"
check "exits non-zero" 1 "$RC"
check "and says it excluded the future file" yes "$(has '1 file(s) dated in the future')"

###############################################################################
printf '\nARM 5  the share-root trap: Backup is pulled whole, and it looked busy\n'
payload 102 0 0 0 400
reset_cycle
cut=$(( NOW - 2 * 86400 ))
check "the share root reads fresh while the mirror under it is dead" yes \
  "$([ -n "$(find "$LIB/Backup" -type f -newermt "@$cut" -print -quit)" ] && echo yes || echo no)"
run "$FIXED"
check "the producer path is judged on its own" yes "$(hasre 'STALE +github-mirror')"
check "its live sibling in the same share passes" yes "$(hasre 'FRESH +appdata-backup')"

###############################################################################
printf '\nARM 6  fail closed: a probe that cannot run is not a pass\n'
payload 0 0 0 0 400
reset_cycle
: >"$CTL/probe-broken"
run "$FIXED"
check "exits non-zero" 1 "$RC"
check "all four legs read UNKNOWN" 4 "$(n 'UNKNOWN ')"
check "cycle verdict is FAIL" yes "$(has 'CYCLE-VERDICT FAIL')"
check "and it says why, rather than going quiet" yes "$(has 'counted as a failure, not a pass')"

###############################################################################
printf '\nARM 7  a source path that is gone is a failure, not an empty success\n'
payload 0 0 0 0 400
rm -rf "$LIB/Backup/paperclip-laca"
reset_cycle
run "$FIXED"
check "exits non-zero" 1 "$RC"
check "names the missing path" yes "$(hasre 'MISSING +paperclip-laca')"
check "cycle verdict is FAIL" yes "$(has 'CYCLE-VERDICT FAIL')"

###############################################################################
printf '\nARM 8  no regression: it still pulls, still snapshots, still powers off\n'
rm -rf "$ARC"; mkdir -p "$ARC/Unraid" "$ARC/GitHubMirror" "$ARC/TimeMachine"
payload 0 0 0 0 400
reset_cycle
run "$FIXED"
check "media/Files landed" 1 "$(landed "$ARC/Unraid/Files")"
check "media/Backup landed (3 repos + appdata + paperclip)" 5 "$(landed "$ARC/Unraid/Backup")"
check "the sparsebundle landed" 1 "$(landed "$ARC/TimeMachine/Zero.sparsebundle")"
check "the mirror landed" 3 "$(landed "$ARC/GitHubMirror/current")"
check "snapshot ran once" 1 "$(calls snapshot)"
check "the next RTC wake was armed" 1 "$(calls arm-wol)"
check "the box powered off" 1 "$(calls poweroff)"
printf '       and a stale payload must not keep an off-site box awake\n'
payload 102 0 0 0 400
reset_cycle
run "$FIXED"
check "a FAIL cycle still arms the wake" 1 "$(calls arm-wol)"
check "a FAIL cycle still powers off" 1 "$(calls poweroff)"
printf '       hold file still honoured\n'
payload 0 0 0 0 400
reset_cycle
: >"$ARC/.airgap-hold"
run "$FIXED"
check "HOLD keeps it on" yes "$(has 'HOLD present')"
check "and nothing powered it off" 0 "$(calls poweroff)"

###############################################################################
printf '\nARM 9  the verdict has to reach a host that is on more than two days a week\n'
payload 102 0 0 0 400
reset_cycle
run "$FIXED"
check "the row reached the always-on host" yes "$(grep -q 'github-mirror=stale' "$LIBSTATUSF" && echo yes || echo no)"
check "and the push is logged" yes "$(has 'verdict pushed to library')"
printf '       a push that fails must not read as a clean cycle\n'
payload 0 0 0 0 400
reset_cycle
printf 'not a directory\n' >"$ROOT/blocker"
AIRGAP_LIB_STATUS_DIR="$ROOT/blocker/nope" run "$FIXED"
check "the failed push is named" yes "$(has 'VERDICT-PUSH-FAILED')"
check "the local row is still written" yes "$([ -f "$STATUSF" ] && echo yes || echo no)"
check "a healthy cycle is still reported healthy" 0 "$RC"

###############################################################################
printf '\nARM 10  library unreachable: a lost cycle is a FAIL with a record\n'
payload 0 0 0 0 400
reset_cycle
: >"$CTL/lib-down"
run "$FIXED"
check "exits non-zero (it used to exit 0)" 1 "$RC"
check "names the cause" yes "$(has 'LIBRARY UNREACHABLE')"
check "leaves a status row" yes "$(grep -q 'library-unreachable' "$STATUSF" && echo yes || echo no)"
check "and still arms the next wake" 1 "$(calls arm-wol)"

###############################################################################
printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
