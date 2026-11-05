#!/usr/bin/env bash
# Exercise every branch of the BAS block in fleet-health-check.sh without touching
# the real fleet. The monitor's own dry run only ever reaches the SKIP branch,
# because the box does not exist, so the FAIL branches would otherwise ship
# unverified. This stubs curl, ssh, log and check and asserts the verdicts.
#
#   ./scripts/bas-fleet-health-block.test.sh            # runs against the copy in this repo
#   BLOCK=~/.paperclip/fleet-health-check.sh ...        # or a section of the real script
#
# Ticket: LAC-4279. Runbook: docs/ops/bas-automation-server.md.
set -u

BLOCK="${BLOCK:-$(dirname "$0")/bas-fleet-health-block.sh}"
[ -r "$BLOCK" ] || { echo "no block at $BLOCK" >&2; exit 1; }

PASS=0; FAIL=0
HARNESS_TMP="$(mktemp -d)"
trap 'rm -rf "$HARNESS_TMP"' EXIT

# --- things the real script provides ---
PAPERCLIP_HOME="$HARNESS_TMP"
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=8"
mkdir -p "$PAPERCLIP_HOME/fleet-health"
log() { echo "LOG $*" >> "$HARNESS_TMP/out"; }
check() { echo "CHECK $1 $([ "$CHECK_OK" = "1" ] && echo OK || echo "FAIL: $CHECK_DETAIL")" >> "$HARNESS_TMP/out"; }

# --- stubs. Scenario state is passed in through these three files. ---
curl() { cat "$HARNESS_TMP/health" 2>/dev/null; }
ssh() {
  # The block uses ssh for two different things: the job probe on the box and the
  # backup-age probe on the NAS. Tell them apart by the host in the argv.
  for a in "$@"; do
    case "$a" in
      root@100.119.64.141) cat "$HARNESS_TMP/nas" 2>/dev/null; return 0;;
    esac
  done
  cat "$HARNESS_TMP/jobs" 2>/dev/null
  return "$(cat "$HARNESS_TMP/jobs_rc" 2>/dev/null || echo 0)"
}

scenario() { # $1=name $2=health json $3=jobs out $4=nas mtime $5=marker(0|1) [$6=jobs rc]
  : > "$HARNESS_TMP/out"
  printf '%s' "$2" > "$HARNESS_TMP/health"
  printf '%s' "$3" > "$HARNESS_TMP/jobs"
  printf '%s' "$4" > "$HARNESS_TMP/nas"
  printf '%s' "${6:-0}" > "$HARNESS_TMP/jobs_rc"
  if [ "$5" = "1" ]; then touch "$PAPERCLIP_HOME/fleet-health/bas-enabled"
  else rm -f "$PAPERCLIP_HOME/fleet-health/bas-enabled"; fi
  CHECK_OK=0; CHECK_DETAIL=""
  # shellcheck disable=SC1090
  . "$BLOCK"
  SCENARIO="$1"
}

expect() { # $1=substring that must appear in the output
  if grep -qF -- "$1" "$HARNESS_TMP/out"; then
    PASS=$((PASS + 1)); echo "  ok   $SCENARIO: $1"
  else
    FAIL=$((FAIL + 1)); echo "  FAIL $SCENARIO: expected \"$1\""; sed 's/^/        /' "$HARNESS_TMP/out"
  fi
}
refute() { # $1=substring that must NOT appear
  if grep -qF -- "$1" "$HARNESS_TMP/out"; then
    FAIL=$((FAIL + 1)); echo "  FAIL $SCENARIO: did not expect \"$1\""; sed 's/^/        /' "$HARNESS_TMP/out"
  else
    PASS=$((PASS + 1)); echo "  ok   $SCENARIO: no \"$1\""
  fi
}

NAS_FRESH=$(( $(date +%s) - 3600 ))
NAS_STALE=$(( $(date +%s) - 40 * 3600 ))
OK_HEALTH='{"status":"ok","databaseBackup":{"latestBackup":{"ageHours":3}}}'

echo "1. no marker: skips everything, loudly"
scenario no-marker "$OK_HEALTH" "" "$NAS_FRESH" 0
expect "LOG SKIP bas:"
refute "CHECK bas "

echo "2. all healthy"
scenario healthy "$OK_HEALTH" "Doug store watch|2" "$NAS_FRESH" 1
expect "CHECK bas OK"
expect "CHECK bas-jobs OK"
expect "CHECK bas-backup OK"

echo "3. control plane down: one alarm, not three"
scenario cp-down '{"status":"error"}' "Doug store watch|2" "$NAS_FRESH" 1
expect "CHECK bas FAIL"
refute "CHECK bas-jobs"   # suppressed on purpose: one cause, one alarm
expect "CHECK bas-backup OK"

echo "4. control plane up but its own backup is stale"
scenario cp-backup-stale '{"status":"ok","databaseBackup":{"latestBackup":{"ageHours":40}}}' "Doug store watch|2" "$NAS_FRESH" 1
expect "CHECK bas FAIL: control plane ok but its DB backup age 40h > 26h"

echo "5. a job has gone stale, and another has never run"
scenario jobs-stale "$OK_HEALTH" "Doug store watch|20
Never ran|never" "$NAS_FRESH" 1
expect "CHECK bas-jobs FAIL"
expect "Doug store watch last succeeded 20h ago"
expect "Never ran has never completed"

echo "6. no routines yet: not a failure"
scenario no-routines "$OK_HEALTH" "" "$NAS_FRESH" 1
expect "CHECK bas-jobs OK"
expect "LOG INFO bas-jobs: no active routines"

echo "7. the job probe itself is broken"
scenario probe-broken "$OK_HEALTH" "bash: /usr/local/bin/bas-job-freshness.sh: No such file" "$NAS_FRESH" 1 1
expect "CHECK bas-jobs FAIL: job freshness probe failed"

echo "8. nothing has ever reached the NAS"
scenario nas-empty "$OK_HEALTH" "Doug store watch|2" "" 1
expect "CHECK bas-backup FAIL"
expect "exists only on the box"

echo "9. the NAS copy has gone stale"
scenario nas-stale "$OK_HEALTH" "Doug store watch|2" "$NAS_STALE" 1
expect "CHECK bas-backup FAIL"
expect "is 40h old (> 26h)"

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
