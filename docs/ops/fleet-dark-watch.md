# Fleet dark watch

One job: tell Lacy when the fleet has **already** gone dark.

`scripts/fleet-dark-watch.sh`, run by cron on `library` every 5 minutes, polls
zero's control-plane health endpoint and sends once when it has been unreachable
for 15 minutes, then once more when it comes back, naming how long the outage
lasted. Two channels: a Slack DM, which is the readable record of what happened,
and an [ntfy](#the-channel-that-survives-do-not-disturb-lac-5366) push, which is
the thing that wakes someone.

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

| Minutes unreachable   | Sent                                       |
| --------------------- | ------------------------------------------ |
| 0 (first failed poll) | nothing, clock starts                      |
| 5, 10                 | nothing                                    |
| 15                    | the dark page, Slack **and** ntfy          |
| 20 ... 700            | nothing                                    |
| back up, having paged | the recovery page, both, with the duration |
| back up, under 15m    | nothing, logged as `BLIP`                  |

Recovery is the only thing that rearms it, so a twelve-hour outage produces two
messages rather than a hundred and forty-four. A control-plane restart that
finishes inside 15 minutes produces none: it goes in the log as a `BLIP` and
nowhere else. Same contract as the power watch, for the same reason, written on
the power watch's own comment: a monitor that repeats itself every five minutes
for twelve hours is a monitor nobody reads.

A `BLIP` can report a duration of 15 minutes or slightly more, and that is not a
contradiction. The page is decided at a **failing** poll; the `BLIP` duration
runs to the recovery, which is up to one 5-minute cron interval later. So the
19:55 - 20:10 window on 2026-10-23 really was dark for 15m and really was never
paged. The line used to say it "recovered before the 15m threshold", which could
not be true as a sentence; it now says it answered again before any poll caught
it past the threshold, which is what happened.

The state file changes **only on a delivered page**, in both directions. A dark
page that no channel accepts is not recorded, so the next poll retries it rather
than silently spending the one page the outage was owed. A recovery that nothing
accepts does not clear the state either, and the moment the plane came back is
pinned into it so the retry reports the duration that was measured rather than
one inflated by however long the notifier was broken.

That second half was missing at first: the recovery cleared the state whether or
not the message went out, so a single transient Slack failure permanently ate
the measured duration, which is the headline number this whole file exists to
produce.

## The channel that survives Do Not Disturb (LAC-5366)

The switch worked and the channel was asleep. Measured over its first five days
on `library`: **8 pages, 22h25m of real fleet dark time, every window caught**,
every page inside 15 minutes. Two windows are 18h45m of that 22h25m.

| Window                    | Dark       | Paged at | Recovered | How               |
| ------------------------- | ---------- | -------- | --------- | ----------------- |
| 2026-10-21 02:50 -> 11:30 | **8h40m**  | 03:05    | 11:30     | human attached AC |
| 2026-10-22 00:15 -> 10:20 | **10h05m** | 00:30    | 10:20     | human attached AC |

Both paged correctly. Both then sat for nine or ten hours. The recovery in both
cases was one physical action, plugging the laptop in, and macOS wake-on-AC did
the rest (`Wake from Hibernate ... due to acattach`). So the page fired, the fix
was ten seconds, and nobody saw it until morning. A Slack bot DM at 00:30 does
not wake a sleeping person, because Slack suppresses push during Do Not Disturb.

So there is a second channel, and it is **additive**. Slack is not going
anywhere: it is the readable log of what happened and the place a morning
scrollback lives. ntfy is the thing that buzzes.

**Why ntfy.** Free, no account, no API token, so no money gate and nothing to
approve. Its iOS and Android apps can be allowed through Do Not Disturb as a
Critical Alert, which is the entire point. The whole integration is one `curl`
to `https://ntfy.sh/<topic>` with the message as the request body.

**Priority 5.** ntfy's maximum, and the one value the iOS app maps to a Critical
Alert and the Android app to a Do Not Disturb bypass. Anything lower makes the
rest of this decorative.

**The topic is the credential.** A public ntfy topic is world-readable and
world-writable by anyone who knows its name, so the name is a long random
string, it lives in a `0600` file beside the Slack token, and it is never
logged. Everything the script prints about ntfy runs through `redact_topic`,
because the topic is in the URL and curl writes the URL it failed on into
several of its own error strings. Unredacted, a failed publish would append the
secret to `/tmp/fleet-dark-watch.err` in plain text, forever.

The 0600 file on `library` is the only copy, the same arrangement the Slack
token has. It is deliberately not in this repo, not in the Paperclip secret
store (agents are refused both read and write there, `403 Board access
required`, so a copy an agent cannot verify is a copy that silently rots), and
not in any issue or comment. To read it:

```bash
ssh root@100.119.64.141 cat /mnt/cachex/appdata/fleet-dark-watch/ntfy-topic
```

Losing it is cheap: generate a new one, write it to that path, re-subscribe the
phone. Nothing else references it.

**`DARK` and `RECOVERED` only.** Not `STILL-DARK`, not `BLIP`, not
`UNREACHABLE`, and not the "I am blind" alarm. Two pushes per outage, maximum.
The reasoning is the one already written on the sibling watches: a monitor that
repeats itself every five minutes is a monitor nobody reads, and that is twice
as true of a Critical Alert, where the remedy a person reaches for is switching
the channel off. The blind alarm stays on Slack alone for the same reason: it is
rate-limited to once an hour because it has no state to dedupe against, it
persists until a human fixes it, and it fires while the fleet itself may be
perfectly healthy. Twenty-four Critical Alerts in a night for a non-outage is
how this change would make things worse than Slack alone.

**At least one channel is a delivered page.** The state file still changes only
on a delivered page, and "delivered" now means either channel accepted it. Both
alternatives are worse. Requiring both would re-buzz the phone every five
minutes for a ten-hour outage whenever Slack is the broken half. Requiring
neither would mark a page delivered that nobody received. The log line names
which half worked:

```
2026-10-24T11:05:01-0400 SENT slack=ok ntfy=ok
2026-10-24T11:05:01-0400 SENT slack=failed ntfy=ok
```

That line is the only place a half-delivered page is visible, because the
delivered half hands the caller a success and the failed half only reaches
stderr.

**A missing topic reports itself.** If the topic file is gone the channel is off
while everything else still works, which would be discovered six hours into the
next overnight outage. So it is reported the way a fallback state dir is, on the
`OK` line the script already writes every five minutes:

```
OK plane answered 200, up since ... (degraded: no ntfy topic in
/mnt/cachex/appdata/fleet-dark-watch/ntfy-topic, so pages go to Slack only and
will not survive Do Not Disturb)
```

**On the phone.** ntfy renders the `Title` header above the body, so the
lock-screen glance is `Fleet is dark` or `Fleet is back` before the phone is
picked up. Those four words are also the first words of the message body, on
purpose: the title on the phone and the sentence in Slack must not say different
things about the same event.

### The one step that cannot be automated

Lacy installs the ntfy app and subscribes to the topic, then allows it through
Do Not Disturb:

1. Install **ntfy** (App Store / Play Store). No account, no sign-in.
2. Subscribe to the topic. Read it with
   `ssh root@100.119.64.141 cat /mnt/cachex/appdata/fleet-dark-watch/ntfy-topic`
   and paste it. Forty random characters; do not retype it.
3. iOS: Settings -> Notifications -> ntfy -> turn on **Critical Alerts** and
   **Time Sensitive Notifications**. Android: long-press the subscription ->
   **Override Do Not Disturb**.

Step 3 is the one that matters. Without it this is a quieter Slack.

## The Slack token is shared, so rotating it is a fleet operation

Worth knowing before anyone treats `slack-token` here as local. `auth.test` on it
returns bot `clawdbot` (`B0A7KQNB6SH`, user `U0A7P7VKM18`) in the `lacymorrow`
workspace, and that same bot token is also:

- in `~/.openclaw/openclaw.json` on zero, plus roughly ten `.bak*` copies
  alongside it
- referenced by `com.buildandserve.fleet-power-watch.plist` and
  `com.buildandserve.store-watch-freshness.plist`

So rotating it is **not** a one-line change to this watch. Minting a new bot
token needs api.slack.com app admin, which is a browser login and therefore
Lacy's to do, and every copy above has to be updated in the same pass or the
sibling watches go silent, which is the exact failure mode this file exists to
prevent. Order matters: mint the new token, write it everywhere, prove each
consumer still posts, and only then revoke the old one. Revoking first takes
every fleet notification down at once.

Tracked separately rather than bundled into a feature PR, for that reason.

The ntfy topic has none of this coupling: it is used by this script alone, it is
generated on the host, and rotating it is two commands plus re-subscribing the
phone.

## Run it by hand

```bash
bash scripts/fleet-dark-watch.sh            # poll, log, print what it would send
bash scripts/fleet-dark-watch.sh --notify   # poll, log, and send for real
```

To prove the phone still wakes, without waiting for an outage: point it at a
dead URL in a throwaway state dir, and inject a clock 15 minutes past the start
instead of sleeping for 15 real minutes.

```bash
ssh root@100.119.64.141 'D=$(mktemp -d); S=$(date +%s)
printf "down_since=%s\npaged=0\n" "$S" > "$D/state"
FLEET_DARK_WATCH_DIR=$D \
FLEET_DARK_WATCH_URL=http://127.0.0.1:1/api/health \
FLEET_DARK_WATCH_NOW=$((S + 900)) \
FLEET_DARK_WATCH_SLACK_TOKEN_FILE=/mnt/cachex/appdata/fleet-dark-watch/slack-token \
FLEET_DARK_WATCH_NTFY_TOPIC_FILE=/mnt/cachex/appdata/fleet-dark-watch/ntfy-topic \
  bash /boot/config/scripts/fleet-dark-watch.sh --notify; grep SENT "$D/fleet-dark-watch.log"'
```

The throwaway `FLEET_DARK_WATCH_DIR` is the load-bearing part: it keeps the test
away from the live state file, so a test cannot consume the page a real outage
is owed. `SENT slack=ok ntfy=ok` in the output is the proof the publish was
accepted; the phone buzzing is the proof it was delivered.

Without `--notify` it never writes _or clears_ the state file, so a dry run
during an outage cannot eat the page, or the recovery message, that a real poll
still owes.

Exit codes: `0` the plane answered, `1` it did not, `2` **this script could not
do its job** (no `curl`, no `jq`, nowhere to write). `2` is never reported as
`0`: "could not look" and "the fleet is fine" are the two readings this file
exists to keep apart, and for a dead-man's switch that distinction is the whole
product. Silence means the fleet is alive.

An exit 2 also **Slack-DMs that it is blind**, and says to treat silence from it
as meaningless until fixed. Printing that to stderr alone was not enough: the
cron line discarded stderr, and when the watch directory is the broken thing the
log is on it too, so the channel is the only place left that works. Since there
is no state file to dedupe against in that case, it is rate-limited by the clock
to one message an hour rather than 288 a day.

Everything is overridable by environment variable for testing, including the
clock, so a 15-minute threshold and an 11-hour outage both cost a millisecond to
test: `FLEET_DARK_WATCH_NOW`, `_DIR`, `_FALLBACK_DIR`, `_URL`, `_HOST`, `_IP`,
`_TIMEOUT`, `_DARK_AFTER`, `_SLACK_CHANNEL`, `_SLACK_TOKEN`, `_SLACK_TOKEN_FILE`,
`_SLACK_API`, `_NTFY_URL`, `_NTFY_TOPIC`, `_NTFY_TOPIC_FILE`, `_NTFY_PRIORITY`.

The test suite neutralises the three ntfy variables rather than inheriting them,
so a test run cannot publish to a real topic on the public ntfy.sh whatever is
in the ambient environment. A test that wants the channel opts in to a local
fake.

## A full pool must not switch the pager off

The pool is at 91% of 932G. One large download closes that gap, and then every
state write fails. The first version of this treated state writes as
infallible, and the result was the worst failure a dead-man's switch has: the
write failed, the next poll found no state, restarted the clock, and never
reached the threshold. A twelve-hour outage would have produced zero pages and
no log line explaining why.

So every state write is checked, and the directory is proven by **writing to
it** rather than by `[ -w ]`, which tests a permission bit and would miss this
entirely. If the pool refuses, state moves to `/tmp` (RAM, so it survives a full
disk) and every healthy log line says `degraded:` until it is fixed. Losing
state on reboot costs at most one duplicate page. Losing it entirely costs the
whole outage.

The Slack token stays pinned to the pool path even when state has fallen back,
because a full filesystem still reads fine. Deriving it from the fallback would
turn a full disk into a missing token and take the notifier down with the thing
it was supposed to report.

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
/mnt/cachex/appdata/fleet-dark-watch/ntfy-topic       the DND channel, 0600
/mnt/cachex/appdata/fleet-dark-watch/fleet-dark-watch.log
/mnt/cachex/appdata/fleet-dark-watch/state            present only during an outage
/tmp/fleet-dark-watch/                                where state goes if the pool refuses a write
/tmp/fleet-dark-watch.err                             anything the script said on stderr
```

```
*/5 * * * * /usr/bin/bash /boot/config/scripts/fleet-dark-watch.sh --notify >/dev/null 2>>/tmp/fleet-dark-watch.err
```

**Do not put `2>&1` back on that line.** stdout is a duplicate of the log and is
safe to drop, but stderr is where "I cannot do my job" goes, and the first
version of this discarded it. An exit-2 poll then produced literally nothing,
which is also what a healthy fleet produces. stderr is empty in normal
operation, so the file only grows when something is actually wrong.

To install or update, from this repo:

```bash
scp scripts/fleet-dark-watch.sh root@100.119.64.141:/boot/config/scripts/
ssh root@100.119.64.141 /usr/local/sbin/update_cron    # only needed if the .cron changed
```

The ntfy topic is installed once, by hand, and is not in this repo. It is
already in place; this is how to replace it:

```bash
ssh root@100.119.64.141 "umask 077 && LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 40 \
  > /mnt/cachex/appdata/fleet-dark-watch/ntfy-topic"
```

Generated on the host so the value never passes through a shell history or a
terminal buffer. Read it back only when re-subscribing the phone, and never
paste it into an issue, a comment, or a commit.

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

The token and the ntfy topic are files rather than inline values in the cron
line because `update_cron` regenerates the crontab onto FAT32, which carries no
permission bits at all. The pool is a real filesystem and can hold a `0600`.

## Deliberately not here

- **No louder tone on the laptop**, no escalating alarm, no sub-15% tier.
  Rejected twice on LAC-4863, and the evidence against it has only got stronger:
  of the eight dark windows this watch has caught, **three happened while the
  laptop was plugged in, two of them at 96-100% charge**. A battery warning
  cannot fire for an outage that is not about the battery.
- **No ntfy for `STILL-DARK`, `BLIP`, `UNREACHABLE`, or the blind alarm.** Two
  pushes per outage, maximum. Reasoning in
  [the DND channel section](#the-channel-that-survives-do-not-disturb-lac-5366).
- **No self-hosted ntfy.** It would be one more service on `library` that can
  die, inside the same house and the same blind spot, to replace a free hosted
  one. The topic being public is handled by the topic being a secret.
- **No tap-to-act button on the push.** ntfy supports action buttons, and the
  action here is physical: plug the laptop in. A button that opens a URL is a
  second thing to maintain that does not fix the outage.
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
- **ntfy.sh is a third party in the waking path.** If it is down or the free
  tier changes, the push silently stops and Slack is the only channel left,
  which is the state LAC-5366 was filed about. It is visible: the per-page log
  line says `ntfy=failed`, and the page still goes out on Slack. Nothing pages
  about the pager, which is the same irreducible problem as the last gap below.
- **Nothing proves the phone is still subscribed.** A successful publish means
  ntfy.sh accepted the message, not that it was delivered or that Critical
  Alerts are still on. Re-test it after an iOS update or a phone change by
  pointing the script at a dead URL (see the run-by-hand section), not by
  waiting for an outage.
- **Tailscale is in the path.** If tailscaled on `library` dies, this pages for
  an outage that is not happening. It would be a true statement that `library`
  cannot see the fleet, which is worth knowing, but the message would point at
  the wrong laptop.
- **Nothing watches this watcher.** If cron on `library` stops, or the script is
  deleted, or the token expires, the result is silence, and silence is also what
  a healthy fleet looks like. This is the irreducible problem with a dead-man's
  switch and the reason every poll writes an `OK` line: the log can be read to
  tell "quiet because healthy" from "quiet because the watch stopped". But
  nobody is paged for the second one. The real fix is a heartbeat _out_ to
  something off-site that alerts on absence, which needs a host outside the
  building and is the same prerequisite as the first gap above.
