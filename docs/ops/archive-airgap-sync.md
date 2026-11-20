# archive airgap sync

`archive` is a Synology DS223j that lives off-site on its own LAN. It is powered
off except Monday and Thursday, when a DSM schedule wakes it around 10:00 ET.
Its 10:05 cron runs `/usr/local/bin/archive-airgap-sync.sh`, which pulls from
always-on `library` over Tailscale, snapshots, arms the next RTC wake and powers
back off. A whole cycle can be over inside ten minutes.

Master copy: `scripts/archive-airgap-sync.sh` in this repo.

## The failure this script was rewritten for

From 2026-07-23 to 2026-11-02 the GitHub mirror on library was frozen on a
GitHub 401. `library-mirror-refresh.sh` failed every single day and the mirror
directory kept existing, so section 3 of this script rsynced a July snapshot to
`/volume1/Archive/GitHubMirror/current/` twice a week for 102 days and logged
`mirror rc=0` every time. 200 repositories had no off-site copy, and nothing in
the pipeline could say so.

The transport was healthy the whole time. That is the point: rsync of a source
directory that still exists succeeds forever, so exit 0 says the copy happened,
not that the data is alive.

**Standing rule, LACA-2951.** A sync or backup job must assert payload
freshness, not just transfer success. Newest mtime in the source older than its
own cadence x 2 is a failure, not a success.

## What the floors are, and why three legs have none

| leg | source path on library | producer | floor |
| --- | --- | --- | --- |
| `github-mirror` | `/mnt/user/Backup/github-mirror` | `library-mirror-refresh.sh`, daily 08:00 | 2d |
| `appdata-backup` | `/mnt/user/Backup/appdata-backup` | library appdata backup, nightly 02:30 | 2d |
| `paperclip-laca` | `/mnt/user/Backup/paperclip-laca` | paperclip dump, nightly ~02:07 | 2d |
| `timemachine` | `/mnt/user/TimeMachine/Zero.sparsebundle` | zero's Time Machine, hourly when awake | 7d |
| `media/Files` | `/mnt/user/Files` | nobody, on a schedule | none |
| `media/images` | `/mnt/user/images` | nobody, on a schedule | none |
| `media/Public` | `/mnt/user/Public` | nobody, on a schedule | none |

Each floor is its producer's cadence doubled, so one missed run is tolerated and
two in a row are not. The TimeMachine floor is looser because zero is a laptop
that sleeps and travels.

The three media shares get no floor, and the script logs that exemption on every
cycle rather than leaving it unsaid. Their real newest mtimes on 2026-11-02 were
`images` 2022-11-27, `Public` 2025-05-13, `Files` 2026-10-11. A blanket
freshness rule over those would fail every cycle forever and would be switched
off inside a week.

## Two traps a naive implementation walks into

Both are live conditions on library today, not hypotheticals.

**A future mtime defeats the check.** `/mnt/user/Backup` holds exactly one file
dated 2107-11-29, `TEMP WINDOWS/Footage/Sony2/PRIVATE/SONY/SONYCARD.IND`, a
camera card index from 2023. Take the newest mtime under that share and it reads
fresh forever. The probe counts future-dated files, reports the count, and
excludes them from every comparison.

**A share root cannot speak for its subdirectories.** `/mnt/user/Backup` is
pulled as one leg and holds four unrelated producers plus archives going back to
2017. Its newest file is whichever producer under it is busiest, which is exactly
how 102 days of frozen `github-mirror` hid inside a share that looked active.
Floors are asserted at the producer path, never at the share root.

## How the check works

Before the transfers, for each leg with a floor, the script sends a small GNU
`find` program to library over the same ssh it is about to rsync through:

- `find "$p" -type f -newermt "@$cutoff" ! -newermt "@$now" -print -quit`
  answers "is anything here newer than the floor and not dated in the future",
  and stops at the first hit. The whole block costs about two seconds against
  library's real tree.
- Only when that says no does it do the full walk to report the actual newest
  mtime, because by then it is an incident and the number is worth paying for.

Four outcomes, and three of them are failures:

| outcome | meaning |
| --- | --- |
| `FRESH` | something under the path is newer than the floor |
| `STALE` | the producer is dead or stalled; logs the newest mtime and its age |
| `MISSING` | the source path is gone |
| `UNKNOWN` | the probe itself could not run, counted as a failure, never a pass |

A stale leg is still pulled. Old data that arrives beats old data that does not,
`--partial` resumes matter, and a fix that read as working by refusing to copy
would be a worse bug than the one it replaces.

A stale cycle also still arms the next RTC wake and powers off. archive is
off-site with no remote WOL path (LACA-688), so a missed power-off costs the next
window too.

## Where the verdict goes, and who reads it

Three places:

1. `/volume1/Archive/.airgap-sync.log` on archive, per-leg detail, as before.
2. `/volume1/Archive/.airgap-sync-status.tsv` on archive, one row per cycle.
3. `/mnt/cachex/appdata/archive-airgap/status.tsv` on **library**, the same row,
   pushed over the ssh that is already open.

Three exists because of one and two: archive is unreadable five days a week, so
a verdict that only lives there can only be read during the window that produced
it. Library is always on, so graphite can read an archive verdict on a Tuesday.

Library state goes on `/mnt/cachex` and never `/mnt/user`: the appdata share
sets a 97.7G floor above the pool's free space and refuses writes with ENOSPC
while `df` reports free space (LAC-4898).

Row format, tab separated:

```
2026-11-02T15:36:10-0500	archive	FAIL	github-mirror=stale:102d appdata-backup=fresh paperclip-laca=fresh timemachine=fresh
```

**Nothing parses that row yet.** fleet-health check 8 judges a cycle `complete`
on `grep -qiE "sync done|all steps done|arming wol|poweroff"` against the sync
log, so it will keep calling a frozen-payload cycle complete. Wiring the check
to `status.tsv` is LACA-2956 and is deliberately not in this change: it needs a
vitals row in both tiers and touches nine deploy artifacts.

## Deliberately not done

- **The destination is not re-measured after the pull.** This asserts the source
  is alive, which is the rule. A pull that silently filtered files would still
  read clean. Adding `dest newest >= source newest` for the two `--delete` legs
  would catch that and is cheap, and it is still a second assertion with its own
  false-positive surface. Not in this change.
- **`--delete` is still absent from the four media legs.** archive is an
  accumulating copy, not a mirror, for `Files images Public Backup`. That is
  deliberate and is tracked in LACA-2464. Never "fix" it by adding `--delete`.
- **Power-off behaviour is unchanged.** A freshness failure does not hold the box
  awake.

## Installing it

archive is powered off outside Monday and Thursday mornings, so this can only be
installed inside a window.

```sh
scp scripts/archive-airgap-sync.sh librarian@100.103.137.89:/tmp/
ssh librarian@100.103.137.89 \
  'cp -p /usr/local/bin/archive-airgap-sync.sh /usr/local/bin/archive-airgap-sync.sh.bak-laca2951 \
   && mv /tmp/archive-airgap-sync.sh /usr/local/bin/archive-airgap-sync.sh \
   && chmod +x /usr/local/bin/archive-airgap-sync.sh'
```

Write then `mv`, never edit in place: the 10:05 cron may be mid-cycle.

**This is blocked until a window proves librarian can write that file.** The file
is root-owned in `/usr/local/bin`, root ssh to archive is denied on publickey,
and no key in the fleet authenticates as root (LACA-2127). `librarian` is in
`administrators` but `sudo` there wants a password nothing in the fleet holds.
`laca2122-archive-inner.sh` now answers this on the first tick of each window
under `Q4`: look for `WRITABLE-FILE`, `WRITABLE-DIR` and `SUDO-NOPASSWD` in
`~/.paperclip/fleet-health/state/laca2122/<date>.txt`. If all three say no, the
install needs Lacy at a keyboard during a window.

The installed copy and this master copy drift in silence, because the box that
holds one of them is off most of the week. Diff them on the first tick of a
window, not from memory.

## Tests

```sh
# run on library, or any GNU/Linux box. NOT on a Mac.
scp scripts/archive-airgap-sync*.sh root@library:/tmp/t/
ssh root@library 'cd /tmp/t && ./archive-airgap-sync-test.sh && ./archive-airgap-sync-seams.sh'
```

The harness needs GNU `find` (`-printf`, `-quit`, `-newermt`) and GNU `touch`
(`-d @epoch`), because the probe it exercises is a GNU find program. BSD find on
a Mac has neither `-printf` nor `-quit`, so a Mac run would test a different
program than production. The harness refuses to run there instead of passing for
the wrong reason.

11 arms, 53 checks:

- **Arm 0 is the control.** It runs `archive-airgap-sync-pre-laca2951.sh`, the
  script as it actually ran, against a payload frozen 102 days, and asserts it
  exits 0, logs `mirror rc=0`, copies the dead repos, and says nothing about
  freshness. If arm 0 ever goes quiet the harness is broken, not the backup.
- `archive-airgap-sync-seams.sh` is what makes arm 0 worth anything. The arm-0
  copy is the live script plus `AIRGAP_*` environment seams and nothing else,
  and that script proves it by substituting every seam back to its default and
  diffing against `archive-airgap-sync.live-20261102.sh.txt`, a byte capture
  taken off archive on 2026-11-02. The normalized diff must be empty. Two
  differences are folded on both sides rather than proven absent: the added
  header comment, and three em dashes that became hyphens under fleet rule 14.
  Nothing greps those strings.
- Arms 3, 4 and 5 are the controls that keep the check from being a blanket:
  four-year-old media must still pass, the 2107-dated file must not buy a pass,
  and a live sibling in the same share must not mask a dead producer. Arms 4 and
  5 each assert first that the naive implementation **would** have been fooled,
  so the trap is demonstrated rather than asserted.
- Arms 6 and 7 are the fail-closed arms: a probe that cannot run and a source
  path that is gone are both failures.
- Arm 8 is the regression arm: every leg still lands, the snapshot still runs,
  the next wake is still armed, the box still powers off, and `.airgap-hold` is
  still honoured.
