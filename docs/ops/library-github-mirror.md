# library GitHub mirror

One job: keep a directly-restorable clone of every GitHub repo Lacy can reach on
hardware that is not GitHub and not the laptop.

`scripts/library-mirror-refresh.sh`, run by cron on `library` daily at 08:00,
mirrors each repo into `/mnt/user/Backup/github-mirror/<owner>/<repo>.git`. 200
repos, 9.8G as of 2026-10-19. The Mac is never in the path: library talks to
github.com itself, so the mirror survives the laptop.

## Why it was a no-op for 88 days (LAC-4898)

The cron line pointed at `/usr/local/bin/library-mirror-refresh.sh`. Nothing put
a copy there, and both halves of the output went to `/dev/null`, so the job
failed every morning from 2026-07-23 to 2026-10-19 without a trace. The last
real refresh was **2026-07-23 08:01 EDT** and nobody knew.

Two separate reasons it could not have worked, and a third found while fixing it:

1. **Nothing staged the script.** Unraid's root filesystem is RAM and is rebuilt
   every boot. Anything copied into `/usr/local/bin` is gone after a reboot
   unless `/boot/config/go` puts it back, and that hook never mentioned this
   script.
2. **It could not have been exec'd from `/boot` either.** `/boot` is FAT32 and
   carries no permission bits, so `chmod +x` there is a silent no-op and the
   file can only run through an interpreter.
3. **The token had expired, and the script called that success.** It parsed the
   response body with `grep` and never looked at the status line. A 401 with
   `Bad credentials` therefore produced an empty repo list, the mirror loop ran
   zero times, and the run logged `refresh done` and exited 0. `wc -l` on an
   empty list answers 1, which is why the log read `discovered 1 repos` while
   holding none.

Reason 3 is the one worth remembering. A backup that reports success while
refusing to run is worse than no backup, because it also removes the worry.

## The three Unraid traps

Every scheduled job on `library` has to clear these. They are the same three the
dark watch hit (`docs/ops/fleet-dark-watch.md`).

| Trap                | What it looks like                                         | What to do                                                                                                  |
| ------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| FAT32 `/boot`       | `Permission denied` running a script you just `chmod +x`'d | invoke it through `/usr/bin/bash <path>`                                                                    |
| RAM root filesystem | the job works today, is gone after a reboot                | keep the master copy on `/boot` and point cron at it, so there is no second copy to go missing              |
| `/mnt/user` ENOSPC  | writes fail with ENOSPC while `df` shows free space        | put state on the pool (`/mnt/cachex/...`); the appdata share sets a 97.7G floor above the pool's free space |

## What runs, and where

```
/boot/config/plugins/dynamix/github-mirror.cron
  0 8 * * * /usr/bin/bash /boot/config/scripts/library-mirror-refresh.sh --notify \
    >> /mnt/cachex/appdata/github-mirror/cron.log 2>&1
```

| Path                                             | What it is                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `scripts/library-mirror-refresh.sh` (this repo)  | the master copy                                                         |
| `/boot/config/scripts/library-mirror-refresh.sh` | the copy cron runs; survives reboots because `/boot` is the flash drive |
| `/mnt/cachex/appdata/github-mirror/.token`       | GitHub fine-grained PAT, root-only                                      |
| `/mnt/cachex/appdata/github-mirror/refresh.log`  | every run, success or not, last 2000 lines                              |
| `/mnt/cachex/appdata/github-mirror/cron.log`     | **failures only.** Empty means healthy                                  |
| `/mnt/user/Backup/github-mirror`                 | the mirror                                                              |

Exit codes: `0` every repo is current, `1` the refresh failed or was partial,
`2` it could not run at all (no git, no token, nowhere to write). `2` is never
recorded as `0`: "could not look" and "the backup is fine" are the two readings
this script exists to keep apart.

## Reading a failure

With `--notify` a failed run Slack-DMs one line, reusing the dark watch's bot
token at `/mnt/cachex/appdata/fleet-dark-watch/slack-token`. One credential, not
two to rot.

| Line                                                | Meaning                                                       |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `MIRROR-BROKEN no GitHub token in ...`              | the token file is missing or empty                            |
| `GitHub answered http=401`                          | the token is expired or revoked, rotate it                    |
| `GitHub answered http=403`                          | rate limited, or the token lost a scope                       |
| `MIRROR-FAILED ... returned no repositories at all` | authenticated as something with no repos                      |
| `FETCH-FAILED <repo>` / `CLONE-FAILED <repo>`       | that one repo did not mirror; the run still fails, on purpose |

The token is scrubbed to `***` everywhere it could surface: the log, stderr and
the Slack message. GitHub error bodies quote the credential back.

## Run it by hand

```sh
ssh root@library
bash /boot/config/scripts/library-mirror-refresh.sh          # log only
bash /boot/config/scripts/library-mirror-refresh.sh --notify # log and DM
tail -20 /mnt/cachex/appdata/github-mirror/refresh.log
```

A full pass over 200 repos takes about 80 seconds when it is only fetching
deltas, and about 20 minutes from empty.

## Rotating the token

Only Lacy can mint it. Fine-grained PAT, `Contents: read` and `Metadata: read`
across all repositories he owns plus any org he needs mirrored. Fine-grained
tokens expire, which is what happened here, so prefer the longest expiry offered
and note the date.

```sh
printf '%s' "github_pat_..." > /mnt/cachex/appdata/github-mirror/.token
chmod 600 /mnt/cachex/appdata/github-mirror/.token
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $(cat /mnt/cachex/appdata/github-mirror/.token)" \
  https://api.github.com/user     # must print 200
bash /boot/config/scripts/library-mirror-refresh.sh
```

Collaborator and org repos only appear if the token grants them. The script asks
for all three affiliations (`owner`, `collaborator`, `organization_member`),
because a repo Lacy only collaborates on is just as unbacked-up as one he owns.

## Verify after any change: the wipe test

Editing the live crontab is not a fix, because the live crontab is RAM. The only
proof is that the line comes back from `/boot` alone, which is what a reboot
does:

```sh
crontab -c /etc/cron.d -l > /tmp/cron.before
crontab -c /etc/cron.d -d            # -d deletes. -r is not a flag here, it prints usage and changes nothing
crontab -c /etc/cron.d -l | wc -l    # expect 0
/usr/local/sbin/update_cron
diff /tmp/cron.before <(crontab -c /etc/cron.d -l)   # expect no output
```

Run this after touching any `*.cron` file in `/boot/config/plugins/dynamix/`.
Note that `crontab -c /etc/cron.d -r` silently does nothing on this box: it
prints a usage block and exits, so a wipe test written with `-r` proves nothing.

## Known gaps

- **Nothing watches this watch.** A silent failure is now loud, but only while
  cron runs it. If `update_cron` is never run after a `.cron` edit, or the
  flash drive is replaced, the job disappears again and the only tell is
  `refresh.log` going quiet. The freshness of `refresh.log` is the thing to
  alarm on, as `doug-store-watch` does for its own cadence.
- **The mirror is not pulled off library.** It is one copy on one box in one
  building. `archive` pulling from it is the point of having a restorable mirror
  and is not set up here.
- **No prune of dead repos.** A repo deleted on GitHub stays in the mirror
  forever. That is deliberate for a backup, but it means the on-disk count
  drifts above the discovered count over time.
