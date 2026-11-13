#!/usr/bin/env bash
# Local CI gate. Runs typecheck, lint, tests, a production build and a route
# smoke on this machine, and prints a Markdown summary for the PR body.
#
# Why: ci.yml on GitHub only runs the cheap half (typecheck, lint, unit tests).
# This script is the full gate, including the production build and route smoke.
# Run it, paste the summary in the PR body. "[skip ci]" and a "ci:full" label
# do nothing here. See the "CI and Local Verification" section of CLAUDE.md.
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

# The build refuses to run without a secret. A throwaway one, generated per run
# and never written anywhere, is enough for a local gate; a real one in the
# environment wins.
export APP_SECRET="${APP_SECRET:-verify-$(openssl rand -hex 16)}"

# typecheck imports two generated content manifests (src/lib/generated/, which is
# gitignored) that only scripts/prebuild-content.mjs writes. `pnpm install` runs
# it from postinstall, but an install with --ignore-scripts does not, and then
# typecheck fails on 4 errors in src/lib/blog.ts and src/lib/changelog.ts that
# have nothing to do with the change under test. The build stage regenerates
# them anyway, so doing it first costs ~0s and removes a false FAIL (LAC-7078).
if [ -f scripts/prebuild-content.mjs ]; then step "content manifests" node scripts/prebuild-content.mjs; fi

has_script typecheck && step "typecheck" $PM typecheck
has_script lint && step "lint" $PM lint
has_script test && step "unit tests" $PM test
has_script test:node && step "node tests" $PM test:node
# The regression suite for the guard that decides whether Vercel builds a
# commit. This arm is the only thing that runs it on a private repo, where
# every Actions job is gated off (LAC-4925); .github/workflows/vercel-ignore-step.yml
# covers it where minutes exist. Pure bash, no dependencies, well under a
# second, so it is not worth a path filter here (LAC-6905).
if [ -f scripts/test-vercel-ignore-step.sh ]; then
  step "vercel ignore step" bash scripts/test-vercel-ignore-step.sh
fi

# Regression suite for stop_server() below. The smoke stage only runs when every
# earlier check is green, so the teardown line it guards had never executed, and
# the bug there cost 12 minutes per run in silence. This suite models the same
# process shape with a subshell wrapper and a grandchild on a throwaway port, so
# it needs no Next build and takes about 6s (LAC-7078).
if [ -f scripts/test-verify-stop-server.sh ]; then
  step "verify teardown" bash scripts/test-verify-stop-server.sh
fi

if [ "$DO_BUILD" = 1 ] && has_script build; then step "build" $PM build; fi

# Prints what holds $PORT and returns 0 when something does; prints nothing and
# returns 1 when it is free. lsof names the pid. Without lsof, a bash /dev/tcp
# connect still catches any TCP listener, not only HTTP ones (LAC-7308).
port_busy() {
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')
    [ -n "$pids" ] && { echo "$pids"; return 0; }
    return 1
  fi
  if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
    echo "unknown (lsof not installed)"; return 0
  fi
  return 1
}

# Tearing the smoke server down is not just `kill $SERVER`. $SERVER is the
# package manager's wrapper process, and pnpm does not forward SIGTERM to the
# `next start` grandchild, so the wrapper outlives the signal, the port stays
# held, and a bare `wait $SERVER` blocks forever. Measured 2026-11-06
# (LAC-7078): this script sat here for 12 minutes with both smoke routes
# already green, which is why it had never printed PASS. Kill whatever holds
# the port first, then the wrapper, with a watchdog so the wait is bounded.
stop_server() {
  local pids=""
  command -v lsof >/dev/null 2>&1 && pids=$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)
  [ -n "$pids" ] && kill $pids 2>/dev/null
  kill "$SERVER" 2>/dev/null
  ( sleep "${STOP_SERVER_GRACE:-15}"; [ -n "$pids" ] && kill -9 $pids 2>/dev/null; kill -9 "$SERVER" 2>/dev/null ) >/dev/null 2>&1 &
  local watchdog=$!
  wait "$SERVER" 2>/dev/null
  kill "$watchdog" 2>/dev/null
}

SMOKE_ROWS=()
if [ "$DO_SMOKE" = 1 ] && [ "$DO_BUILD" = 1 ] && [ "$FAILED" = 0 ] && has_script start; then
  # A listener already on $PORT would answer the smoke routes in place of the
  # fresh build, and stop_server() would then kill it. Refuse to start (LAC-7308).
  BUSY=$(port_busy)
  if [ -n "$BUSY" ]; then
    echo "verify: port $PORT is already in use (pid: $BUSY). Stop it or pass --port <free port>. Smoke not run." >&2
    SMOKE_ROWS+=("| (smoke not run) | port $PORT in use | **FAIL** |")
    FAILED=1
  else
    PORT=$PORT $PM start > /tmp/verify-start.log 2>&1 &
    SERVER=$!
    for _ in $(seq 1 40); do curl -s -o /dev/null -m 3 "http://localhost:$PORT/" && break; sleep 2; done
    if [ -z "$ROUTES" ]; then ROUTES="/ /nope-404=404"; fi
    for spec in $ROUTES; do
      path="${spec%%=*}"; want="${spec#*=}"; [ "$want" = "$spec" ] && want=200
      got=$(curl -s -o /dev/null -m 60 -w "%{http_code}" "http://localhost:$PORT$path")
      if [ "$got" = "$want" ]; then SMOKE_ROWS+=("| \`$path\` | $got | pass |"); else SMOKE_ROWS+=("| \`$path\` | $got (want $want) | **FAIL** |"); FAILED=1; fi
    done
    stop_server
  fi
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
