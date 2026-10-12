# ---- 1c. BAS automation box on Hetzner (added 2026-10-12, LAC-4279) ----
# Reviewable copy of this block lives in buildandserve: scripts/bas-fleet-health-block.sh.
# The authoritative copy is this file, graphite:~/.paperclip/fleet-health-check.sh.
# Runbook: buildandserve docs/ops/bas-automation-server.md.
#
# Why it is checked from here and not on the box: a box cannot be the thing that
# notices it is down. raw-kratom.com was dark for two days (LACA-1909) and LACA
# itself was down 14h on 2026-10-11, both times because the only watcher was the
# thing being watched. graphite already watches the rest of the fleet every 15
# minutes, so BAS is checked here instead of growing a launchd agent of its own.
#
# Three checks, because any one of them alone lies:
#   bas         control plane answers on the tailnet and its own DB backup is fresh
#   bas-jobs    every client job has actually completed recently (a server that
#               answers /api/health while every job fails is the real outage)
#   bas-backup  a dump landed on the library NAS recently, judged ON the NAS, so
#               a completely dead box fails this too
#
# Gated on a marker file: until the box is in service there is nothing to check and
# a FAIL would be noise. Bring-up creates the marker (see the runbook). The skip is
# logged on every run so an unprovisioned box cannot hide quietly forever.
BAS_HOST="${FLEET_HEALTH_BAS_HOST:-bas.hyrax-boga.ts.net}"
BAS_MARKER="$PAPERCLIP_HOME/fleet-health/bas-enabled"
BAS_NAS_DIR="${FLEET_HEALTH_BAS_NAS_DIR:-/mnt/user/backups/paperclip-bas}"
BAS_JOB_MAX_HOURS="${FLEET_HEALTH_BAS_JOB_MAX_HOURS:-9}"   # Doug store watch is every 4h; 9h tolerates one miss
BAS_SSH="ssh -i $HOME/.ssh/fleet_health_ed25519 $SSH_OPTS"
if [ ! -f "$BAS_MARKER" ]; then
  log "SKIP bas: $BAS_MARKER absent, so the Hetzner automation box is not in service yet (LAC-4279)"
else
  # --- bas: control plane + its own backup freshness ---
  CHECK_OK=0; CHECK_DETAIL=""
  bh=$(curl -sS -m 15 "https://$BAS_HOST/api/health" 2>&1)
  if echo "$bh" | jq -e '.status=="ok"' >/dev/null 2>&1; then
    bage=$(echo "$bh" | jq -r '.databaseBackup.latestBackup.ageHours // 999')
    if [ "$(echo "$bage > 26" | bc)" = "1" ]; then
      CHECK_DETAIL="control plane ok but its DB backup age ${bage}h > 26h"
    else
      CHECK_OK=1
    fi
  else
    CHECK_DETAIL="https://$BAS_HOST/api/health bad: $bh"
  fi
  check bas "BAS automation box unhealthy ($BAS_HOST)"

  # --- bas-jobs: every active routine completed inside its budget ---
  # Only meaningful when the control plane is up; when it is down the check above
  # already fired and this would just be a second alarm for one cause.
  if [ "$CHECK_OK" = "1" ]; then
    CHECK_OK=0; CHECK_DETAIL=""
    jobs_out=$($BAS_SSH "root@$BAS_HOST" /usr/local/bin/bas-job-freshness.sh 2>&1)
    if [ -z "$jobs_out" ]; then
      # No active routines at all. Not a failure: the box is built before the
      # first job is scheduled, and an empty roster is the expected state then.
      CHECK_OK=1
      log "INFO bas-jobs: no active routines on $BAS_HOST yet"
    elif ! echo "$jobs_out" | grep -q '|'; then
      CHECK_DETAIL="job freshness probe failed: $jobs_out"
    else
      stale=""
      while IFS='|' read -r title hours; do
        [ -n "$title" ] || continue
        if [ "$hours" = "never" ]; then
          stale="$stale; $title has never completed"
        elif [ "$hours" -gt "$BAS_JOB_MAX_HOURS" ] 2>/dev/null; then
          stale="$stale; $title last succeeded ${hours}h ago"
        fi
      done <<EOF_JOBS
$jobs_out
EOF_JOBS
      if [ -n "$stale" ]; then
        CHECK_DETAIL="client jobs stale (budget ${BAS_JOB_MAX_HOURS}h)${stale}"
      else
        CHECK_OK=1
      fi
    fi
    check bas-jobs "BAS client jobs are not running"
  fi

  # --- bas-backup: a dump actually reached the library NAS ---
  # Judged on the NAS so this still fails when the box is gone entirely, which is
  # exactly the case where the box's own report would be unavailable.
  CHECK_OK=0; CHECK_DETAIL=""
  nas_age=$(ssh -i "$HOME/.ssh/fleet_health_ed25519" $SSH_OPTS root@100.119.64.141 \
    "ls -t '$BAS_NAS_DIR' 2>/dev/null | head -1 | while read -r f; do stat -c %Y \"$BAS_NAS_DIR/\$f\"; done" 2>/dev/null)
  if [ -z "$nas_age" ]; then
    CHECK_DETAIL="no Paperclip dump in library:$BAS_NAS_DIR at all; the BAS database exists only on the box"
  else
    hrs=$(( ( $(date +%s) - nas_age ) / 3600 ))
    if [ "$hrs" -gt 26 ]; then
      CHECK_DETAIL="newest dump in library:$BAS_NAS_DIR is ${hrs}h old (> 26h)"
    else
      CHECK_OK=1
    fi
  fi
  check bas-backup "BAS database backup is not reaching the library NAS"
fi
