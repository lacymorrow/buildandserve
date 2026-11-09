#!/bin/sh
###############################################################################
# archive-airgap-sync.sh (root, on scheduled wake Mon/Thu ~10:05)
# FINAL MODEL - pull everything from always-on library, snapshot, power off.
#   media (photos/videos/docs) + Mac TimeMachine sparsebundle + GitHub mirror.
# Mac is entirely out of the path (Mac -> iCloud + TM->library only).
# Library reached over Tailscale via /usr/local/bin/lib-ssh (nc-proxy, because
# archive's kernel has no /dev/net/tun -> tailscaled is userspace-only). LAN is
# only a fallback for the rare case archive is co-located with library again.
#
# This file is the master copy. The live copy is /usr/local/bin/archive-airgap-sync.sh
# on archive, and archive is powered off except Mon/Thu, so the two drift in
# silence. docs/ops/archive-airgap-sync.md says how to install and how to prove
# the installed copy matches.
#
# -------------------------------------------------------------------- LACA-2951
# Why this script now asserts payload freshness:
#
# From 2026-07-23 to 2026-11-02 the GitHub mirror on library was frozen on a
# 401. Section 3 rsynced that frozen directory to /volume1/Archive twice a week
# for 102 days and logged rc=0 every time. 200 repositories had no off-site copy
# and nothing in this pipeline could say so, because rsync of a source that
# still exists succeeds forever. Exit 0 said the copy happened, not that the
# data was alive.
#
# The rule: a payload with a known producer must be newer than its producer's
# cadence x 2, or the cycle is a FAILURE no matter what rsync returned.
#
# Two traps found while implementing it, both live conditions on library:
#
#   1. A FUTURE mtime defeats a freshness check. /mnt/user/Backup holds one
#      file dated 2107-11-29 (a Sony camera card index from 2023). A naive
#      "newest mtime" over that share reads fresh forever. Future-dated files
#      are counted and then excluded from every comparison.
#   2. A SHARE ROOT cannot speak for its subdirectories. /mnt/user/Backup is
#      pulled as one leg, and its newest file is whichever producer under it is
#      most active. That is exactly why 102 days of frozen github-mirror hid
#      inside a share that looked busy. Floors are asserted at the producer
#      path, never at the share root.
#
# Deliberately NOT done here, so the next person does not assume it was: the
# destination copy on archive is not re-measured after the pull. This asserts
# the source is alive, which is the rule that was asked for. A pull that
# silently filtered files would still read clean.
###############################################################################
RK="${AIRGAP_PULL_KEY:-/root/.ssh/archive_pull}"
SSHBASE="-i $RK -o StrictHostKeyChecking=no -o BatchMode=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=4 -o ConnectTimeout=20"
LOG="${AIRGAP_LOG:-/volume1/Archive/.airgap-sync.log}"
LIBSSH="${AIRGAP_LIBSSH:-/usr/local/bin/lib-ssh}"
LIB_TS="${AIRGAP_LIB_TS:-100.119.64.141}"
LIB_LAN="${AIRGAP_LIB_LAN:-192.168.1.161}"
SRC="${AIRGAP_SRC:-/mnt/user}"
DEST="${AIRGAP_DEST:-/volume1/Archive}"
SNAPSHOT="${AIRGAP_SNAPSHOT:-/usr/local/bin/archive-snapshot.sh}"
ARM_WOL="${AIRGAP_ARM_WOL:-/usr/local/bin/archive-arm-wol.sh}"
POWEROFF="${AIRGAP_POWEROFF:-/usr/syno/bin/syno_sched_poweroff}"

# Where the cycle verdict is written. The copy on archive is unreadable five
# days a week, so the verdict is also pushed to library, which is always on.
# Library state goes on /mnt/cachex and never on /mnt/user: the appdata share
# sets a 97.7G floor above the pool's free space and refuses writes with ENOSPC
# while df reports free space (LAC-4898).
STATUS="${AIRGAP_STATUS:-$DEST/.airgap-sync-status.tsv}"
LIB_STATUS_DIR="${AIRGAP_LIB_STATUS_DIR:-/mnt/cachex/appdata/archive-airgap}"

# Floors, in days. Each is its producer's cadence x 2, so one missed run is
# tolerated and two in a row are not.
AGE_GITHUB_MIRROR="${AIRGAP_AGE_GITHUB_MIRROR:-2}"    # library-mirror-refresh.sh, daily 08:00
AGE_APPDATA_BACKUP="${AIRGAP_AGE_APPDATA_BACKUP:-2}"  # library appdata backup, nightly 02:30
AGE_PAPERCLIP_LACA="${AIRGAP_AGE_PAPERCLIP_LACA:-2}"  # paperclip dump, nightly ~02:07
AGE_TIMEMACHINE="${AIRGAP_AGE_TIMEMACHINE:-7}"        # zero is a laptop: hourly when awake, and it travels

# Payloads nobody writes on a schedule. Named here rather than left unmentioned,
# because an unstated exemption is indistinguishable from an oversight. Real
# newest mtimes on 2026-11-02: images 2022-11-27, Public 2025-05-13,
# Files 2026-10-11. A floor on these would fail every cycle forever.
AT_REST="media/Files media/images media/Public"

log(){ echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$LOG"; }

FAILED=0
FAIL_NAMES=""
VERDICT_PARTS=""

note_fail() {
  FAILED=$((FAILED + 1))
  FAIL_NAMES="$FAIL_NAMES $1"
}

# assert_fresh <label> <absolute source path on library> <floor in days>
#
# Appends one line to the log and one token to the cycle verdict. Anything it
# cannot measure is a failure: an unreachable probe, a missing path and a dead
# producer are all "this payload is not known to be alive", and only one of
# those three used to be visible.
assert_fresh() {
  af_label=$1
  af_path=$2
  af_days=$3
  af_pad=$(printf '%-15s' "$af_label")

  # The remote program is single-quoted so its own $ survive to library; only
  # the two parameters are interpolated here. No heredoc: lib-ssh is an
  # nc-proxy wrapper and an inner ssh eats a heredoc on stdin.
  af_out=$($SSH "$L" "p='$af_path'; d=$af_days; "'
    if [ ! -e "$p" ]; then echo "missing 0 0 - 0"; exit 0; fi
    n=$(date +%s); c=$(( n - d * 86400 ))
    fut=$(find "$p" -type f -newermt "@$n" 2>/dev/null | wc -l | tr -d " ")
    if [ -n "$(find "$p" -type f -newermt "@$c" ! -newermt "@$n" -print -quit 2>/dev/null)" ]; then
      echo "fresh $n 0 - $fut"
    else
      w=$(find "$p" -type f ! -newermt "@$n" -printf "%T@ %TY-%Tm-%TdT%TH:%TM:%TS\n" 2>/dev/null | sort -rn | head -1)
      set -- $w
      e=${1:-0}; e=${e%%.*}; h=${2:--}; h=${h%%.*}
      echo "stale $n ${e:-0} ${h:--} $fut"
    fi' 2>/dev/null)
  af_rc=$?

  set -- $af_out
  af_state=${1:-}
  af_now=${2:-0}
  af_newest=${3:-0}
  af_iso=${4:--}
  af_future=${5:-0}

  if [ "$af_rc" -ne 0 ] || [ -z "$af_state" ]; then
    log "   UNKNOWN  $af_pad freshness probe failed (rc=$af_rc) - counted as a failure, not a pass"
    VERDICT_PARTS="$VERDICT_PARTS $af_label=unknown"
    note_fail "$af_label"
    return 1
  fi

  case "$af_future" in
    ''|0|*[!0-9]*) : ;;
    *) log "   WARN     $af_pad $af_future file(s) dated in the future, excluded from this verdict" ;;
  esac

  case "$af_state" in
    fresh)
      log "   FRESH    $af_pad something newer than ${af_days}d exists"
      VERDICT_PARTS="$VERDICT_PARTS $af_label=fresh"
      return 0
      ;;
    missing)
      log "   MISSING  $af_pad $af_path does not exist on library  FRESHNESS-FAILED"
      VERDICT_PARTS="$VERDICT_PARTS $af_label=missing"
      note_fail "$af_label"
      return 1
      ;;
    *)
      af_age=$(( (af_now - af_newest) / 86400 ))
      [ "$af_newest" = "0" ] && af_age=-1
      log "   STALE    $af_pad newest $af_iso (${af_age}d old, floor ${af_days}d)  FRESHNESS-FAILED"
      VERDICT_PARTS="$VERDICT_PARTS $af_label=stale:${af_age}d"
      note_fail "$af_label"
      return 1
      ;;
  esac
}

# record_verdict <OK|FAIL> <detail string>
# Writes the row on archive, then pushes the same row to library. A push that
# fails is logged; it does not turn the cycle green and it does not abort it,
# because by then the pull has already happened.
record_verdict() {
  rv_detail=$(printf '%s' "$2" | sed 's/^ *//')
  rv_row="$(date '+%Y-%m-%dT%H:%M:%S%z')	archive	$1	$rv_detail"
  rv_row=$(printf '%s' "$rv_row" | tr -d "'")
  printf '%s\n' "$rv_row" >> "$STATUS" 2>/dev/null \
    || log "could not write $STATUS"
  if [ -n "${LIBHOST:-}" ]; then
    if $SSH "$L" "mkdir -p '$LIB_STATUS_DIR' && printf '%s\\n' '$rv_row' >> '$LIB_STATUS_DIR/status.tsv'" 2>/dev/null; then
      log "verdict pushed to library:$LIB_STATUS_DIR/status.tsv"
    else
      log "VERDICT-PUSH-FAILED could not reach library:$LIB_STATUS_DIR/status.tsv"
    fi
  fi
}

# --- resolve library: Tailscale nc-proxy (on/off-site), else direct LAN ---
LIBHOST=""; SSH=""
if "$LIBSSH" "root@$LIB_TS" true 2>/dev/null; then
  LIBHOST=$LIB_TS; SSH=$LIBSSH
elif ssh $SSHBASE "root@$LIB_LAN" true 2>/dev/null; then
  LIBHOST=$LIB_LAN; SSH="ssh $SSHBASE"
fi

log "===================== airgap sync start ====================="
if [ -z "$LIBHOST" ]; then
  log "LIBRARY UNREACHABLE (tried tailscale nc-proxy + LAN) - aborting cycle"
  log "CYCLE-VERDICT FAIL  library-unreachable, nothing pulled"
  record_verdict FAIL "library-unreachable"
  if [ ! -f "$DEST/.airgap-hold" ]; then "$ARM_WOL"; "$POWEROFF"; fi
  exit 1
fi
log "library via $LIBHOST"
L="root@$LIBHOST"

# --- 0. FRESHNESS (before the transfers, so the log reads cause then effect) ---
# Every leg below is still pulled even when its payload is stale. Old data that
# arrives is better than old data that does not, --partial resumes matter, and a
# fix that reads as working by refusing to copy would be a worse bug than the
# one it replaces.
log ">> freshness"
assert_fresh github-mirror  "$SRC/Backup/github-mirror"          "$AGE_GITHUB_MIRROR"
assert_fresh appdata-backup "$SRC/Backup/appdata-backup"         "$AGE_APPDATA_BACKUP"
assert_fresh paperclip-laca "$SRC/Backup/paperclip-laca"         "$AGE_PAPERCLIP_LACA"
assert_fresh timemachine    "$SRC/TimeMachine/Zero.sparsebundle" "$AGE_TIMEMACHINE"
log "   at-rest, no floor by design: $AT_REST"

# --- 1. MEDIA (photos/videos/docs/footage) ---
for share in Files images Public Backup; do
  log ">> media/$share"
  rsync -a --partial -e "$SSH" "$L:$SRC/$share/" "$DEST/Unraid/$share/" >>"$LOG" 2>&1
  rc=$?
  log "   media/$share rc=$rc"
  [ "$rc" -eq 0 ] || { log "   TRANSFER-FAILED media/$share rc=$rc"; note_fail "media/$share"; VERDICT_PARTS="$VERDICT_PARTS media/$share=rc$rc"; }
done

# --- 2. Mac TimeMachine sparsebundle (opaque full-Mac copy; includes memories) ---
log ">> TimeMachine/Zero.sparsebundle"
mkdir -p "$DEST/TimeMachine"
rsync -a --partial --delete -e "$SSH" \
  "$L:$SRC/TimeMachine/Zero.sparsebundle" "$DEST/TimeMachine/" >>"$LOG" 2>&1
rc=$?
log "   timemachine rc=$rc"
[ "$rc" -eq 0 ] || { log "   TRANSFER-FAILED timemachine rc=$rc"; note_fail timemachine-transfer; VERDICT_PARTS="$VERDICT_PARTS timemachine=rc$rc"; }

# --- 3. GitHub mirror (directly-restorable repos, refreshed on library from github) ---
log ">> github-mirror"
rsync -a --partial --delete -e "$SSH" \
  "$L:$SRC/Backup/github-mirror/" "$DEST/GitHubMirror/current/" >>"$LOG" 2>&1
rc=$?
log "   mirror rc=$rc"
[ "$rc" -eq 0 ] || { log "   TRANSFER-FAILED github-mirror rc=$rc"; note_fail github-mirror-transfer; VERDICT_PARTS="$VERDICT_PARTS mirror=rc$rc"; }

# --- 4. SNAPSHOT read-only + prune (GitHubMirror; GoldenFreeze kept as historical) ---
log ">> snapshot"; "$SNAPSHOT" >>"$LOG" 2>&1

# --- 5. VERDICT, then POWER OFF (arms next RTC wake) unless hold-file present ---
if [ "$FAILED" -eq 0 ]; then
  log "CYCLE-VERDICT OK   every payload newer than its floor"
  record_verdict OK "$VERDICT_PARTS"
else
  log "CYCLE-VERDICT FAIL  $FAILED payload(s) not known to be alive:$FAIL_NAMES"
  record_verdict FAIL "$VERDICT_PARTS"
fi

log "===================== airgap sync done ====================="
if [ -f "$DEST/.airgap-hold" ]; then
  log "HOLD present - staying on"
else
  log "powering off (arms next wake)"; "$ARM_WOL"; "$POWEROFF"
fi

# A stale payload must not keep the box awake: a missed power-off also misses
# the next RTC wake arm, and archive is off-site with no remote WOL path
# (LACA-688). It reports and leaves.
[ "$FAILED" -eq 0 ]
