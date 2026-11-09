#!/usr/bin/env bash
# Proves the claim that archive-airgap-sync-pre-laca2951.sh is the live script
# plus harness seams and nothing else.
#
# Arm 0 of the test harness runs the pre-LACA-2951 copy and asserts it reports
# success on a dead payload. That arm is only worth anything if the copy really
# is the old logic, so this script substitutes every AIRGAP_* seam back to the
# value it defaults to and diffs the result against the byte capture taken off
# archive on 2026-11-02 by laca2122-archive-inner.sh.
#
# Two differences are normalized on BOTH sides and are therefore not proven
# absent, only declared:
#   - the added header comment block in the pre copy (stripped here)
#   - three em dashes in the live file's comments and log strings became
#     hyphens, under fleet rule 14. Nothing greps those strings: fleet-health
#     check 8 matches only "sync done|all steps done|arming wol|poweroff".
#
# Exits 0 when the normalized files are identical. Prints the raw diff too, so
# a reviewer can see what the normalizer touched rather than trusting it.
set -uo pipefail
cd "$(dirname "$0")" || exit 2

LIVE=archive-airgap-sync.live-20261102.sh.txt
PRE=archive-airgap-sync-pre-laca2951.sh

[ -f "$LIVE" ] || { echo "missing $LIVE"; exit 2; }
[ -f "$PRE" ] || { echo "missing $PRE"; exit 2; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# --- the live capture: only em dash folding ---
sed 's/\xe2\x80\x94/-/g' "$LIVE" >"$tmp/live"

# --- the pre copy: drop the added header, then undo every seam ---
# The added header runs from line 2 until the live file's own banner, which
# begins at the "archive-airgap-sync.sh (root, on scheduled wake" comment. awk
# re-emits the banner rule itself rather than keeping the one above the header,
# so no BSD-vs-GNU `sed i` difference gets involved.
awk 'NR==1 {print; print "###############################################################################"; next}
     skip==0 && /^# archive-airgap-sync\.sh \(root, on scheduled wake/ {skip=1}
     skip==1 {print}' "$PRE" >"$tmp/pre0"

sed -e 's/\xe2\x80\x94/-/g' \
    -e 's/^\([A-Z_]*\)="\${AIRGAP_[A-Z_]*:-\(.*\)}"$/\1=\2/' \
    -e 's|"\$LIBSSH" "root@\$LIB_TS"|/usr/local/bin/lib-ssh root@100.119.64.141|' \
    -e 's|"root@\$LIB_LAN"|root@192.168.1.161|' \
    -e 's|LIBHOST=\$LIB_TS|LIBHOST=100.119.64.141|' \
    -e 's|LIBHOST=\$LIB_LAN|LIBHOST=192.168.1.161|' \
    -e 's|SSH=\$LIBSSH|SSH=/usr/local/bin/lib-ssh|' \
    -e 's|\$SRC/|/mnt/user/|g' \
    -e 's|"\$DEST/|"/volume1/Archive/|g' \
    -e 's|\$DEST/|/volume1/Archive/|g' \
    -e 's|"\$SNAPSHOT"|/usr/local/bin/archive-snapshot.sh|' \
    -e 's|"\$ARM_WOL"|/usr/local/bin/archive-arm-wol.sh|g' \
    -e 's|"\$POWEROFF"|/usr/syno/bin/syno_sched_poweroff|g' \
    "$tmp/pre0" \
| sed -e '/^LIBSSH=\/usr\/local\/bin\/lib-ssh$/d' \
      -e '/^LIB_TS=100\.119\.64\.141$/d' \
      -e '/^LIB_LAN=192\.168\.1\.161$/d' \
      -e '/^SRC=\/mnt\/user$/d' \
      -e '/^DEST=\/volume1\/Archive$/d' \
      -e '/^SNAPSHOT=\/usr\/local\/bin\/archive-snapshot\.sh$/d' \
      -e '/^ARM_WOL=\/usr\/local\/bin\/archive-arm-wol\.sh$/d' \
      -e '/^POWEROFF=\/usr\/syno\/bin\/syno_sched_poweroff$/d' >"$tmp/pre"
# The eight deletions above drop the seam block's own assignment lines, which
# the live file never had. Every USE of those variables was rewritten to its
# literal by the substitutions above, and that is the part that matters.

echo "--- raw diff, live capture vs the harness baseline (seams are the only entries) ---"
diff -u "$LIVE" "$PRE" | sed -n '3,200p' | sed 's/^/  /'

echo
echo "--- normalized diff (must be empty) ---"
if diff -u "$tmp/live" "$tmp/pre"; then
  echo "  empty: the baseline is the live script plus seams only"
  exit 0
fi
echo
echo "NOT EQUIVALENT: the baseline differs from the live script by more than its seams."
exit 1
