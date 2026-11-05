#!/usr/bin/env bash
# Local CI gate. Runs typecheck, lint, tests, a production build and a route
# smoke on this machine, and prints a Markdown summary for the PR body.
#
# Why: ci.yml on GitHub only runs the cheap half (typecheck, lint, unit tests).
# This script is the full gate, including the production build and route smoke.
# Run it, paste the summary in the PR body. "[skip ci]" and a "ci:full" label
# do nothing here. See the "CI and Local Verification" section of CLAUDE.md.
#
# Note: as of 2026-11-05 this script does not pass on main (1 typecheck error,
# 7 failing unit test files). That is LAC-7035, not your change.
#
# Usage: scripts/verify.sh [--no-build] [--no-smoke] [--port 3040] [--routes "/ /blog /nope-404=404"]
#   Routes are space separated; "=CODE" sets the expected status (default 200).
set -u

PORT=3040
DO_BUILD=1
DO_SMOKE=1
ROUTES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-build) DO_BUILD=0 ;;
    --no-smoke) DO_SMOKE=0 ;;
    --port) PORT="$2"; shift ;;
    --routes) ROUTES="$2"; shift ;;
    -h|--help) sed -n 2,17p "$0"; exit 0 ;;
  esac
  shift
done

if [ -f bun.lock ] || [ -f bun.lockb ]; then PM="bun run"; elif [ -f pnpm-lock.yaml ]; then PM="pnpm"; else PM="npm run"; fi
has_script() { node -e "process.exit(require('./package.json').scripts?.['$1'] ? 0 : 1)"; }

RESULTS=()
FAILED=0
step() {
  local name="$1"; shift
  local start=$(date +%s)
  if "$@" > "/tmp/verify-${name//[^a-zA-Z0-9]/_}.log" 2>&1; then
    RESULTS+=("| $name | pass | $(( $(date +%s) - start ))s |")
  else
    RESULTS+=("| $name | **FAIL** | $(( $(date +%s) - start ))s | see /tmp/verify-${name//[^a-zA-Z0-9]/_}.log |")
    FAILED=1
  fi
}

has_script typecheck && step "typecheck" $PM typecheck
has_script lint && step "lint" $PM lint
has_script test && step "unit tests" $PM test
has_script test:node && step "node tests" $PM test:node
if [ "$DO_BUILD" = 1 ] && has_script build; then step "build" $PM build; fi

SMOKE_ROWS=()
if [ "$DO_SMOKE" = 1 ] && [ "$DO_BUILD" = 1 ] && [ "$FAILED" = 0 ] && has_script start; then
  PORT=$PORT $PM start > /tmp/verify-start.log 2>&1 &
  SERVER=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null -m 3 "http://localhost:$PORT/" && break; sleep 2; done
  if [ -z "$ROUTES" ]; then ROUTES="/ /nope-404=404"; fi
  for spec in $ROUTES; do
    path="${spec%%=*}"; want="${spec#*=}"; [ "$want" = "$spec" ] && want=200
    got=$(curl -s -o /dev/null -m 60 -w "%{http_code}" "http://localhost:$PORT$path")
    if [ "$got" = "$want" ]; then SMOKE_ROWS+=("| \`$path\` | $got | pass |"); else SMOKE_ROWS+=("| \`$path\` | $got (want $want) | **FAIL** |"); FAILED=1; fi
  done
  kill $SERVER 2>/dev/null; wait $SERVER 2>/dev/null
fi

echo
echo "## Local verification ($(git rev-parse --short HEAD), $(date -u +%Y-%m-%dT%H:%MZ), $(node -v), ${PM%% *})"
echo
echo "| Check | Result | Time |"
echo "|---|---|---|"
printf '%s\n' "${RESULTS[@]}"
if [ ${#SMOKE_ROWS[@]} -gt 0 ]; then
  echo
  echo "| Route | Status | Result |"
  echo "|---|---|---|"
  printf '%s\n' "${SMOKE_ROWS[@]}"
fi
echo
if [ "$FAILED" = 1 ]; then echo "Result: FAIL"; exit 1; else echo "Result: PASS. Paste this summary in the PR body."; fi
