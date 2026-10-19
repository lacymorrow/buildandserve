# Fleet dark watch

One job: tell Lacy when the fleet has **already** gone dark.

`scripts/fleet-dark-watch.sh`, run by cron on `library` every 5 minutes, polls
zero's control-plane health endpoint and Slack-DMs once when it has been
unreachable for 15 minutes, then once more when it comes back, naming how long
the outage lasted.

The thing that makes it work is not the script. It is that it does not run on
the Mac.

## Why it exists (LAC-4874)

[The power watch](./fleet-power-watch.md) is the pre-mortem: it warns while
there is still time to plug in. It fired. `fleet-power-watch.log` holds four
separate discharge cycles down to 2-7%, every one of them a delivered Slack DM,
every one of them ignored. A fifth louder copy of an ignored message is not a
fix.

And no warning of any volume helps after the Mac is dead, which is where the
outage actually went. On 2026-10-19 at 23:36:52 the Mac rebooted and sat at the
FileVault prompt, alive and useless, for **11h41m**. Every fleet watch there is
(power, stranded, lease-loss, store, fleet-health, usage-governor) is a
`~/Library/LaunchAgents` job _on that host_, so all of them were dead too. Zero
signal left the building until Lacy sat down at the laptop.

The fleet had a pre-mortem and no post-mortem. This is the post-mortem.

## The two messages

Going dark:

```
Fleet is dark. The control plane on zero stopped answering 15m ago, at 12:58 EDT.
Nothing is running: no agent runs, no routines, no store watch. Every other watch
lives on that same Mac, so none of them can tell you either. Check the laptop:
power first, then the FileVault prompt.
```

Coming back:

```
Fleet is back. The control plane answered again at 00:39 EDT, after 11h41m dark.
Anything scheduled in that window did not run.
```

What happened first, because that is the fact. What is stopped second, because
"the control plane is down" is not actionable at 23:30. The action last, and it
names the two things to look at, because the 2026-10-19 cause was the second one.

The recovery line is the one that would have made this issue unnecessary, and the
duration in it is measured, not estimated: `serverInfo.processStartedAt` from the
health body is when the plane actually started answering, which is up to five
minutes earlier than when a 5-minute poll noticed. A `processStartedAt` from
_before_ the outage began is ignored, because that means the plane never
restarted and the network was the broken part.

## One outage, two messages

| Minutes unreachable   | Sent                               |
| --------------------- | ---------------------------------- |
| 0 (first failed poll) | nothing, clock starts              |
| 5, 10                 | nothing                            |
| 15                    | the dark DM                        |
| 20 ... 700            | nothing                            |
| back up, having paged | the recovery DM, with the duration |
| back up, under 15m    | nothing, logged as `BLIP`          |

Recovery is the only thing that rearms it, so a twelve-hour outage produces two
messages rather than a hundred and forty-four. A control-plane restart that
finishes inside 15 minutes produces none: it goes in the log as a `BLIP` and
nowhere else. Same contract as the power watch, for the same reason, written on
the power watch's own comment: a monitor that repeats itself every five minutes
for twelve hours is a monitor nobody reads.

The state file is written **only on a delivered DM**, so a Slack outage retries
on the next poll instead of silently spending the one page the outage was owed.

## Run it by hand

```bash
bash scripts/fleet-dark-watch.sh            # poll, log, print what it would send
bash scripts/fleet-dark-watch.sh --notify   # poll, log, and DM for real
```

Without `--notify` it never writes the state file, so a dry run cannot eat the
page a real outage is owed.

Exit codes: `0` the plane answered, `1` it did not, `2` **this script could not
do its job** (no `curl`, no `jq`, nowhere to write). `2` is never reported as
`0`: "could not look" and "the fleet is fine" are the two readings this file
exists to keep apart, and for a dead-man's switch that distinction is the whole
product. Silence means the fleet is alive.

Everything is overridable by environment variable for testing, including the
clock, so a 15-minute threshold and an 11-hour outage both cost a millisecond to
test: `FLEET_DARK_WATCH_NOW`, `_DIR`, `_URL`, `_HOST`, `_IP`, `_TIMEOUT`,
`_DARK_AFTER`, `_SLACK_CHANNEL`, `_SLACK_TOKEN`, `_SLACK_TOKEN_FILE`.

## `--resolve` is load-bearing

From `library`, this is the only form of the request that answers:

```bash
curl -sS -m 10 --resolve zero.hyrax-boga.ts.net:443:100.86.145.8 \
  https://zero.hyrax-boga.ts.net/api/health
```

| Attempt                              | Result                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `https://zero.hyrax-boga.ts.net/...` | `http=000`, instant. `library` runs `--accept-dns=false`, so MagicDNS names do not resolve there  |
| `https://100.86.145.8/...`           | `curl: (35) TLS connect error`. By-IP sends no SNI, and Tailscale Serve's cert needs the hostname |
| `ping 100.86.145.8`                  | 0% loss, 3.9ms. TCP 443 is open                                                                   |
| with `--resolve`                     | **200 in 59ms**                                                                                   |

A `000` and a TLS `35` both look like a firewall and neither one is. Do not
spend an hour there. The failing `curl` message is written into the log for the
same reason.

`FLEET_DARK_WATCH_IP` is zero's Tailscale address, stable per node. If it ever
changes, `tailscale ip -4 zero` prints the new one.

## Schedule

Cron on `library` (Unraid, wired, always on), every 5 minutes.

```
/boot/config/plugins/dynamix/fleet-dark-watch.cron   the schedule
/boot/config/scripts/fleet-dark-watch.sh             the script
/mnt/cachex/appdata/fleet-dark-watch/slack-token      the token, 0600
/mnt/cachex/appdata/fleet-dark-watch/fleet-dark-watch.log
/mnt/cachex/appdata/fleet-dark-watch/state            present only during an outage
```

```
*/5 * * * * /usr/bin/bash /boot/config/scripts/fleet-dark-watch.sh --notify > /dev/null 2>&1
```

To install or update, from this repo:

```bash
scp scripts/fleet-dark-watch.sh root@100.119.64.141:/boot/config/scripts/
ssh root@100.119.64.141 /usr/local/sbin/update_cron    # only needed if the .cron changed
```

### Three Unraid traps, all of them load-bearing

**Unraid is stateless.** The root filesystem is RAM and is rebuilt every boot.
Anything that must survive a reboot lives under `/boot/config`, which is the USB
flash. Both the script and its schedule are there. `update_cron` concatenates
`/boot/config/plugins/dynamix/*.cron` into the system crontab and runs from the
`disks_mounted` boot event, so the schedule is rebuilt from the flash on every
boot. Verified by wiping the live crontab and running `update_cron`: the entry
came back from `/boot` alone.

**`/boot` is FAT32 and cannot hold an exec bit.** `chmod +x` there silently does
nothing. That is why the cron line invokes `bash <path>` rather than the script
directly, and why there is no second staged copy in `/usr/local/bin` to drift
out of date. `github-mirror.cron` got this wrong: it targets a
`/usr/local/bin` path that nothing stages, so it has been a silent daily no-op
for at least 58 days (LAC-4898).

**Do not write to `/mnt/user/appdata`.** The share sets `shareFloor=97.7G`, the
pool has less free than that, and so every write through `shfs` is refused with
`No space left on device` while `df` reports 88G free. `/mnt/cachex` is the same
bytes without the share layer in the way.

The token is a file rather than an inline value in the cron line because
`update_cron` regenerates the crontab onto FAT32, which carries no permission
bits at all. The pool is a real filesystem and can hold a `0600`.

## Deliberately not here

- **No second channel.** Slack is what the sibling watches use and it is
  strictly better than today's zero off-host signal. Slack demonstrably did not
  wake Lacy at 23:30, four times, so he has been asked separately which channel
  should. When he answers, `notify()` is one function and swapping it is a
  one-line change.
- **No louder tone on the laptop**, no escalating alarm, no sub-15% tier. The
  ignored-warning evidence says volume is not the lever.
- **No FileVault or auto-login change.** Lacy's decision only.
- **No Unraid notification agent.** `library` has exactly one configured,
  `/boot/config/plugins/dynamix/notifications/agents/Slack.sh`, dated Sep 2022.
  Assume that webhook is dead; it is unproven and nothing here is built on it.
- **No lock file.** A cycle costs at most 25s against a 300s interval, and a
  torn state file costs at most one duplicate page because `state_get` only
  matches a complete numeric line. A stuck lock would silence this watch
  permanently. For a dead-man's switch that trade is not close.

## Delete it when

The control plane no longer runs on one laptop. LAC-4279 is the server that
would finish the job. A control plane with real uptime gets watched by something
that is not a cron job on a NAS in the same house.

## Known gaps

- **`library` is the new single point of failure.** It is in the same house, on
  the same AT&T connection, on the same power. A whole-house outage takes both
  machines and nothing pages. This moves the blind spot, it does not remove it;
  removing it needs a host outside the building.
- **It watches the control plane, not the work.** A plane that answers `200`
  while every run fails is invisible to this. That is
  [the stranded-work watch](./paperclip-stranded-watch.md)'s job.
- **Tailscale is in the path.** If tailscaled on `library` dies, this pages for
  an outage that is not happening. It would be a true statement that `library`
  cannot see the fleet, which is worth knowing, but the message would point at
  the wrong laptop.
