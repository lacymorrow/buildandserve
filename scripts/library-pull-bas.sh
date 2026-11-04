#!/bin/bash
# Pull the bas box's backups onto the library NAS. Runs ON library (Unraid), not the box.
# Installed at /mnt/user/backups/bas/pull.sh; cron file
# /boot/config/plugins/dynamix/bas-backup.cron (Unraid merges it into /etc/cron.d/root,
# so it is NOT visible in `crontab -l`).
#
# Same recipe as /mnt/user/backups/buildandserve/pull.sh (LAC-5980, Lacy's scope
# 2026-10-29): the box never pushes. It holds no NAS credential at all. The key here is
# restricted on the box to `command="/usr/bin/rrsync -ro /data/backups",restrict`, so
# even a stolen copy of it can read backups and nothing else.
#
#   projects/    nightly pg_dump -Fc per database + globals. Kept 60 days here; the box
#                keeps 7. Added to, never mirrored, so a box that lost its dumps cannot
#                take the NAS copies with it.
#   pgbackrest/  the pgBackRest repo: full backups + continuous WAL for point in time
#                recovery. MIRRORED, because pgBackRest owns its retention (14 days) and
#                deleting individual files by age would orphan a backup from its WAL.
set -euo pipefail
B=/mnt/user/backups/bas
# The tailnet IP, not the MagicDNS name: library does not resolve ts.net names.
SRC=root@100.117.119.81
SSH="ssh -i $B/.ssh/pull_key -o BatchMode=yes -o ConnectTimeout=25 -o UserKnownHostsFile=$B/.ssh/known_hosts -o StrictHostKeyChecking=accept-new"
KEEP_DAYS=60

# A failed pull must leave a line, or silence looks the same as a pull that never ran.
trap 'echo "$(date -u +%FT%TZ) FAIL line $LINENO" >> "$B/pull.log"' ERR

mkdir -p "$B/projects" "$B/pgbackrest"

rsync -a --partial -e "$SSH" "$SRC:projects/" "$B/projects/"

# --delete on the repo mirror only after proving the source still has a repo. A box that
# came back from a rebuild with an empty /data/backups would otherwise turn "mirror" into
# "erase the only copy".
if rsync -e "$SSH" --list-only "$SRC:pgbackrest/backup/projects/backup.info" >/dev/null 2>&1; then
	rsync -a --delete -e "$SSH" "$SRC:pgbackrest/" "$B/pgbackrest/"
else
	echo "$(date -u +%FT%TZ) FAIL no pgbackrest repo on the box; mirror left untouched" >> "$B/pull.log"
	exit 1
fi

find "$B/projects" -type f -mtime +$KEEP_DAYS -delete
find "$B/projects" -mindepth 1 -type d -empty -delete
chown -R 99:100 "$B/projects" "$B/pgbackrest"
echo "$(date -u +%FT%TZ) OK projects=$(du -sh "$B/projects" | cut -f1) pgbackrest=$(du -sh "$B/pgbackrest" | cut -f1)" >> "$B/pull.log"
