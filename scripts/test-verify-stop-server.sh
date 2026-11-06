#!/usr/bin/env bash
# Regression test for stop_server() in scripts/verify.sh.
#
# The defect (LAC-7078, measured 2026-11-06): the smoke stage tore the server
# down with `kill $SERVER; wait $SERVER`. $SERVER is the package manager's
# wrapper, and pnpm does not forward SIGTERM to its `next start` grandchild, so
# the wrapper outlived the signal while its child held the port and `wait`
# blocked forever. verify.sh sat there 12 minutes with both smoke routes
# already green, which is why it had never printed PASS. The smoke stage only
# runs once every earlier check passes, so nothing had ever reached this line.
#
# The two cases below model that process shape with a wrapper subshell and a
# grandchild holding the port, so this needs no Next build and takes seconds.
# It evals the real function out of verify.sh instead of copying it, so the
# test cannot drift from the implementation.
#
# Usage: bash scripts/test-verify-stop-server.sh [port]
set -u

PORT=${1:-34099}
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
PASS=0
FAIL=0
SERVER=""

ok()  { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
holder() { lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null; }

for dep in python3 lsof curl; do
  command -v "$dep" >/dev/null 2>&1 || { echo "SKIP: $dep not available"; exit 0; }
done
[ -z "$(holder)" ] || { echo "SKIP: port $PORT is already in use"; exit 0; }

eval "$(sed -n '/^stop_server() {/,/^}/p' "$ROOT/scripts/verify.sh")"
eval "$(sed -n '/^port_busy() {/,/^}/p' "$ROOT/scripts/verify.sh")"
type port_busy >/dev/null 2>&1 || {
  echo "FAIL: could not extract port_busy() from scripts/verify.sh"; exit 1; }
type stop_server >/dev/null 2>&1 || {
  echo "FAIL: could not extract stop_server() from scripts/verify.sh"; exit 1; }

# A listener that honours SIGTERM even though its parent ignores it. Signal
# dispositions set to SIG_IGN are inherited, so the handler has to be installed
# explicitly or the child would inherit the wrapper's "ignore".
PY_LISTENER='import signal, sys, http.server, socketserver
signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", int(sys.argv[1])), http.server.SimpleHTTPRequestHandler) as s:
    s.serve_forever()'

# $1: "polite" (grandchild dies on SIGTERM, like next-server) or "stubborn"
# (nothing in the tree honours SIGTERM, so only the watchdog can end it).
start_fake_server() {
  if [ "$1" = polite ]; then
    ( trap '' TERM; python3 -c "$PY_LISTENER" "$PORT" >/dev/null 2>&1 ) &
  else
    ( trap '' TERM; python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 ) &
  fi
  SERVER=$!
  local i=0
  while [ $i -lt 50 ]; do
    curl -s -o /dev/null -m 1 "http://127.0.0.1:$PORT/" && return 0
    sleep 0.2
    i=$((i + 1))
  done
  return 1
}

cleanup() {
  local p
  p=$(holder); [ -n "$p" ] && kill -9 $p 2>/dev/null
  if [ -n "$SERVER" ]; then kill -9 "$SERVER" 2>/dev/null; wait "$SERVER" 2>/dev/null; fi
  SERVER=""
  return 0
}
trap cleanup EXIT

echo "1. negative control: killing only the wrapper leaves the port held"
if start_fake_server polite; then
  kill "$SERVER" 2>/dev/null
  sleep 1
  if [ -n "$(holder)" ]; then
    ok "port $PORT still held after kill \$SERVER, which is the defect this guards"
  else
    bad "kill \$SERVER alone released the port, so this test no longer discriminates"
  fi
  cleanup; sleep 1
else
  bad "could not start the fake server"
fi

echo "2. stop_server releases the port promptly when the listener honours SIGTERM"
if start_fake_server polite; then
  START=$(date +%s)
  stop_server
  ELAPSED=$(( $(date +%s) - START ))
  [ -z "$(holder)" ] && ok "port $PORT released" || bad "port $PORT still held"
  [ "$ELAPSED" -le 5 ] && ok "returned in ${ELAPSED}s, no watchdog needed" \
                       || bad "took ${ELAPSED}s, expected 5s or less on the graceful path"
  cleanup; sleep 1
else
  bad "could not start the fake server"
fi

echo "3. stop_server is still bounded when nothing in the tree honours SIGTERM"
# Production waits STOP_SERVER_GRACE (15s by default) before escalating to
# SIGKILL. Shorten it here so the test proves the watchdog exists without
# paying 15s on every verify run.
if start_fake_server stubborn; then
  START=$(date +%s)
  STOP_SERVER_GRACE=2 stop_server
  ELAPSED=$(( $(date +%s) - START ))
  [ -z "$(holder)" ] && ok "port $PORT released by the watchdog" || bad "port $PORT still held"
  [ "$ELAPSED" -le 8 ] && ok "returned in ${ELAPSED}s instead of blocking forever" \
                       || bad "took ${ELAPSED}s, the wait is not bounded"
  cleanup
else
  bad "could not start the fake server"
fi

echo "4. port_busy refuses a held port, names the pid, and passes a free one (LAC-7308)"
if port_busy >/dev/null; then bad "port_busy reported a free port as busy"; else ok "free port reported free"; fi
if start_fake_server polite; then
  OUT=$(port_busy); RC=$?
  [ "$RC" = 0 ] && ok "held port reported busy" || bad "held port reported free"
  case "$OUT" in *"$(holder | head -1)"*) ok "output names the holding pid";; *) bad "output '$OUT' lacks the holder pid";; esac
  cleanup
else
  bad "could not start the fake server"
fi

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
