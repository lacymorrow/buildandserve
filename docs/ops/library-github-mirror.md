# library GitHub mirror

Mirrors every GitHub repo Lacy can reach onto `library` so the repos have a
directly-restorable backup that does not depend on a Mac being awake.

- Script: `scripts/library-mirror-refresh.sh` (this repo is the master copy)
- Installed at: `/boot/config/scripts/library-mirror-refresh.sh` on `library`
- Schedule: daily 08:00, `/etc/cron.d/root` and
  `/boot/config/plugins/dynamix/github-mirror.cron`
- Payload: `/mnt/user/Backup/github-mirror`
- State, log, token, notify ledger: `/mnt/cachex/appdata/github-mirror/`
- Off-site leg: `archive-airgap-sync.sh` section 3 rsyncs the payload to
  `/volume1/Archive/GitHubMirror/current/` on `archive`, Mon and Thu

Origin: LAC-4898. Silent-failure repair: LACA-2513. Notification rationing and
expiry warning: LACA-2947.

## Three Unraid traps

These are in the script's header too, because all three have already cost an
outage.

1. `/boot` is FAT32 and cannot hold an exec bit. `chmod +x` there is a silent
   no-op, so cron has to call the script through an interpreter:
   `/usr/bin/bash /boot/config/scripts/library-mirror-refresh.sh`.
2. The root filesystem is RAM and is rebuilt on every boot. Anything staged into
   `/usr/local/bin` is gone after a reboot unless `/boot/config/go` copies it
   back. The original cron line pointed at `/usr/local/bin/...` and nothing
   staged it, so the job was a **no-op from 2026-07-23 to 2026-10-19** and
   nobody heard about it.
3. State goes on `/mnt/cachex`, never `/mnt/user`. The appdata share sets a
   97.7G floor above the pool's free space and refuses writes with ENOSPC while
   `df` reports free space.

## The credential

`/mnt/cachex/appdata/github-mirror/.token`, mode 600, one line, no newline
needed. The script reads it and nothing else does.

**It must be a classic PAT with `repo` scope, and it should have no expiry.**
Both halves of that matter, and the July 2026 outage is what each one costs:

- **Classic, not fine-grained.** The script mirrors three affiliations:
  `owner`, `collaborator` and `organization_member`. A fine-grained PAT is
  scoped to one resource owner, so it cannot read a repo that someone else
  owns. The payload contains non-owner repos such as
  `tristanxperkins/wedflex-wedflexers.git`, so a fine-grained token silently
  narrows the backup to Lacy's own repos while still exiting 0.
- **No expiry.** A fine-grained PAT always expires and a classic one can. The
  token installed 2026-07-23 was `github_pat_` (fine-grained, 93 chars); it aged
  out, every run answered `http=401 Bad credentials`, and the payload sat frozen
  for 102 days.

The script now reads GitHub's `github-authentication-token-expiration`
response header on every run, logs it, and DMs once when the expiry is inside
`LIBRARY_MIRROR_EXPIRY_WARN_DAYS` (default 14). A token with no expiry logs
`token expiry not stated by GitHub`, which is the healthy line to see.

Replacing it (no agent can mint a PAT, this is a browser action):

```bash
# on library, so the value never passes through a shell history or an agent log
install -m 600 /dev/null /mnt/cachex/appdata/github-mirror/.token
cat > /mnt/cachex/appdata/github-mirror/.token   # paste, then Ctrl-D
/usr/bin/bash /boot/config/scripts/library-mirror-refresh.sh   # no --notify
```

A good run ends `=== refresh done: N updated, M cloned, K repos on disk ===`
and exits 0. The first run after a long outage is a large catch-up fetch; check
pool headroom before starting it, per trap 3.

## Notifications

`--notify` Slack-DMs Lacy, reusing the dark watch's bot token at
`/mnt/cachex/appdata/fleet-dark-watch/slack-token` rather than introducing a
second credential to rot. Channel `U3XC80UUQ`.

A DM costs a **change of state**, not a run. Before LACA-2947 the daily cron
DMed on every run, so one expired token announced itself seven times a week for
fifteen weeks in the channel Lacy also uses for approval cards.

| Event | DM |
| --- | --- |
| First run of an outage | yes |
| Same outage, same run key | no, logged only |
| Same outage, a week since the last DM | yes, one reminder |
| A **different** failure than the one on record | yes |
| First run that succeeds again | yes, one recovery line |
| Healthy run | no |
| Token expiry inside the warning window | yes, then weekly |
| A DM Slack refuses | nothing is recorded; the next run says it again |

The ledger is `/mnt/cachex/appdata/github-mirror/notify-state`, one line:

```
<key> <first_seen_epoch> <last_notified_epoch> <runs_since_first_seen>
```

Keys name the **kind** of failure, not its wording: `api-http-401`,
`api-http-500`, `api-empty`, `api-malformed`, `fetch-failures`,
`token-missing`, `token-expiring`, `dep-missing`, `log-unwritable`,
`mirror-unwritable`, `tmp-unwritable`. The messages carry page numbers and repo
counts that move between runs of one unchanging outage, so dedup is keyed on
the key and never on the text.

Four properties worth not breaking:

- **Dedup only ever suppresses a DM that was delivered.** The ledger is written
  after Slack accepts the message, never before. It used to be written first,
  so one refused send on the first run of an outage was filed as "told him" and
  bought six quiet days (LAC-6465). The same rule holds for the weekly reminder
  and for the recovery line: a refused send leaves the ledger where it was, and
  the next run tries again. A permanently broken Slack therefore re-attempts
  daily, which costs nothing because nothing arrives.
- **Silence while red is bounded.** The weekly reminder exists because
  permanent silence while red is the original defect, not the fix for it.
- **A missing or corrupt ledger DMs every run.** It fails toward noise, never
  toward silence. The failed write is itself logged loudly.
- **A run without `--notify` does not touch the ledger.** Otherwise a hand-run
  would eat the DM the next cron run owed Lacy.

To see the suppression working, read the log rather than the channel:

```bash
grep 'already reported' /mnt/cachex/appdata/github-mirror/refresh.log
```

## Judging this backup

Exit code 0 means the copy ran, not that the data is alive. A backup leg whose
source directory still exists rsyncs successfully forever, which is how the
off-site leg reported healthy twice a week while copying a July snapshot.

Check in this order:

1. **Newest file mtime in the payload.** The only honest number.
   ```bash
   find /mnt/user/Backup/github-mirror -type f -printf '%T+\n' | sort -r | head -1
   ```
2. The producer's own log (`refresh.log`), not the transport's.
3. Exit codes last, and never alone.

Do not read `refresh.log`'s start date as the failure start date. That log
begins 2026-10-19 only because the script was rewritten that day. The payload
mtime is what dated the outage to July.

## Tests

`scripts/library-mirror-refresh-test.sh` stands up a stub GitHub API and a stub
Slack endpoint and counts DMs across a scripted outage. Run it anywhere with
`bash`, `git`, `jq`, `curl` and `python3`:

```bash
bash scripts/library-mirror-refresh-test.sh
```

32 checks over 10 arms. Arm 0 is a **control**: it runs the pre-LACA-2947
script and asserts three identical failures DM three times. If arm 0 ever goes
quiet the harness has stopped observing DMs and the other arms prove nothing.
It needs `library-mirror-refresh-pre-laca2947.sh` beside it for that arm.

Arm 9 covers the delivery rule above. The stub reads `SLACK` from its control
directory: `ok` accepts the DM, `reject` answers Slack's own `{"ok":false}`.
Attempted sends are counted separately from delivered ones, because "it tried
and Slack refused" and "it stayed quiet" are the same number of DMs and the
whole defect lives in the difference. Against the pre-LAC-6465 script that arm
fails three of its seven checks.
