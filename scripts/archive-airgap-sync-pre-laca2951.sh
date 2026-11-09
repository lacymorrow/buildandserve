#!/bin/sh
###############################################################################
# archive-airgap-sync.sh AS IT RAN BEFORE LACA-2951 - kept only so the test
# harness can watch the old behaviour. Do not install this file.
#
# This is a byte-faithful copy of /usr/local/bin/archive-airgap-sync.sh on
# archive (captured 2026-11-02 by laca2122-archive-inner.sh) with ONE class of
# change: every hardcoded path, address and helper binary is read from an
# AIRGAP_* environment variable that defaults to the hardcoded value. No
# control flow, no command and no ordering is different. `make seams` in
# docs/ops/archive-airgap-sync.md shows how to verify that claim.
#
# The reason to keep it: arm 0 of the harness runs THIS file against a frozen
# payload and asserts it reports success. A harness that cannot still observe
# the defect cannot prove the fix.
###############################################################################
# archive-airgap-sync.sh (root, on scheduled wake Mon/Thu ~10:05)
# FINAL MODEL - pull everything from always-on library, snapshot, power off.
#   media (photos/videos/docs) + Mac TimeMachine sparsebundle + GitHub mirror.
# Mac is entirely out of the path (Mac -> iCloud + TM->library only).
# Library reached over Tailscale via /usr/local/bin/lib-ssh (nc-proxy, because
# archive's kernel has no /dev/net/tun -> tailscaled is userspace-only). LAN is
# only a fallback for the rare case archive is co-located with library again.
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
log(){ echo "[$(date '+%m-%d %H:%M:%S')] $*" >> "$LOG"; }

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
  if [ ! -f $DEST/.airgap-hold ]; then "$ARM_WOL"; "$POWEROFF"; fi
  exit 0
fi
log "library via $LIBHOST"
L="root@$LIBHOST"

# --- 1. MEDIA (photos/videos/docs/footage) ---
for share in Files images Public Backup; do
  log ">> media/$share"
  rsync -a --partial -e "$SSH" "$L:$SRC/$share/" "$DEST/Unraid/$share/" >>"$LOG" 2>&1
  log "   media/$share rc=$?"
done

# --- 2. Mac TimeMachine sparsebundle (opaque full-Mac copy; includes memories) ---
log ">> TimeMachine/Zero.sparsebundle"
mkdir -p $DEST/TimeMachine
rsync -a --partial --delete -e "$SSH" \
  "$L:$SRC/TimeMachine/Zero.sparsebundle" $DEST/TimeMachine/ >>"$LOG" 2>&1
log "   timemachine rc=$?"

# --- 3. GitHub mirror (directly-restorable repos, refreshed on library from github) ---
log ">> github-mirror"
rsync -a --partial --delete -e "$SSH" \
  "$L:$SRC/Backup/github-mirror/" $DEST/GitHubMirror/current/ >>"$LOG" 2>&1
log "   mirror rc=$?"

# --- 4. SNAPSHOT read-only + prune (GitHubMirror; GoldenFreeze kept as historical) ---
log ">> snapshot"; "$SNAPSHOT" >>"$LOG" 2>&1

# --- 5. POWER OFF (arms next RTC wake) unless hold-file present ---
log "===================== airgap sync done ====================="
if [ -f $DEST/.airgap-hold ]; then
  log "HOLD present - staying on"
else
  log "powering off (arms next wake)"; "$ARM_WOL"; "$POWEROFF"
fi
