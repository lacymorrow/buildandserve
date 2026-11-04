# Fleet power watch

One job: tell Lacy before the laptop sleeps and takes the whole fleet with it.

`scripts/fleet-power-watch.ts`, run by launchd every 5 minutes, reads
`pmset -g batt` and sends one line when the Mac is on battery and getting low.
Once below 20%, once below 10%, nothing more until it is back on AC. The 20%
heads-up is a Slack DM. The 10% warning is a Slack DM **and** a Critical Alert
on Lacy's phone, because a Slack DM alone was measured insufficient (LAC-6137).

## Why it exists (LAC-4574)

Every agent run, every routine and every client-facing watch in this company
executes on one laptop. On 2026-10-16 that laptop slept at 1% battery:

```
2026-10-16 07:31:24 -0400 Sleep  Entering Sleep state due to 'Low Power Sleep' ... (Charge:1%)
2026-10-16 09:30:51 -0400 Wake   Wake from Hibernate [CDNVA] : due to charger/UserActivity
```

Two hours. Zero `activity_log` rows, zero `heartbeat_runs`, the 12:00Z Doug
store watch slot never evaluated, and six runs that morning died
`setup_failed: Legacy controller lease lost` and parked their issues silently.
Nothing said any of it. The gap was found afterwards, by reading `pmset -g log`.

[The stranded-work watch](./paperclip-stranded-watch.md) names this as its own
known gap: it watches the board, not the machine. This is the machine half.

Those six reaped runs are measured and fixed separately. Lease loss killed 15
runs in 14 days and cost one routine 3 of its 7 daily slots;
[the lease-loss retry](./paperclip-lease-loss-retry.md) re-runs them on wake, so
a sleep this warning did not prevent costs less (LAC-4586).

## The alert

```
Mac at 8% on battery, about 24 min left. Below ~5% it sleeps and the whole fleet
stops: no routines, no agent runs, no store watch. Plug in.
```

The number first, because that is the decision. What stops, because "low
battery" is something the menu bar already says and nobody acts on. The action
last, because it is one word of work.

The estimate is dropped rather than invented when pmset does not have one, which
is normal for a minute or two after unplugging.

## One discharge, two messages

| Battery | On battery | Sent                                |
| ------- | ---------- | ----------------------------------- |
| 21%     | yes        | nothing                             |
| 18%     | yes        | Slack                               |
| 14%     | yes        | nothing                             |
| 8%      | yes        | Slack + phone                       |
| 3%      | yes        | nothing                             |
| any     | plugged in | nothing, and the two warnings rearm |

AC is the only thing that rearms it, so a long discharge produces two messages
rather than twenty. Crossing both thresholds between two checks (the Mac was
asleep, or this was installed mid-discharge) spends both and sends one message,
at the urgent weight: a Mac first seen at 6% pages the phone rather than quietly
DMing Slack.

A warning counts as spent when **at least one** channel accepted it. Requiring
both would re-page the phone every five minutes for the whole discharge whenever
Slack is the broken half, which is how a Critical Alert gets switched off.
Requiring neither would record a warning nobody received. The cost is visible in
the log: `SENT at 10% slack=failed ntfy=ok` says that tier's Slack copy never
arrived and the phone buzzed anyway.

## Why the second warning goes to the phone (LAC-6137)

On 2026-10-28 this watch DM'd at 11:27 (17%) and 11:52 (8%). Both were
delivered, neither was acted on, the Mac hibernated at 12:14 at 1%, and the
fleet lost 3h32m. The dark watch's Critical Alert fired at 12:30, sixteen
minutes after a cable would still have helped. One buzz at 8% costs ten seconds;
the same buzz at 12:30 costs three hours.

This is not the "louder battery warning" LAC-4874 rejected. That rejected
repeating an ignored Slack message, and it predates
[the dark watch](./fleet-dark-watch.md) building a channel that survives Do Not
Disturb. The channel is the new fact.

The phone leg is ntfy at priority 5, the only value its iOS app maps to a
Critical Alert, on the **same topic and priority the dark watch pages on**. One
subscription on the phone, one Critical Alert setting to keep switched on, one
thing to re-test. Two topics would be two chances for the pre-mortem to be the
one he forgot to allow through Do Not Disturb.

The topic is the credential: a public ntfy topic is world-readable and
world-writable by whoever knows the name, and it travels in the URL. It lives in
`~/.paperclip/ntfy-topic` at 0600, never in this repo and never in the plist,
and everything this script prints about ntfy is scrubbed first, because `fetch`
puts the URL it failed on into its own error text. Rotating it is now a
two-host operation: see
[the dark watch runbook](./fleet-dark-watch.md#the-slack-token-is-shared-so-rotating-it-is-a-fleet-operation).

No topic means the phone leg is simply off and Slack still works. That is the
right failure direction, but it is silent, so it is worth re-proving:

```bash
bun scripts/fleet-power-watch.ts --self-test
```

That sends a real message on both channels, labelled as a test in its own first
words. A `slack=ok ntfy=ok` proves ntfy.sh accepted it, **not** that iOS
delivered it or that Critical Alerts are still on. The only way to learn that is
to ask whether the phone buzzed, which is the last gate on LAC-6137. Worth
re-running after an iOS update or a phone change.

A machine with no battery reports as permanently fine, so the same file is safe
on the Hetzner box (LAC-4279).

## Run it by hand

```bash
bun scripts/fleet-power-watch.ts                     # print, send nothing
bun scripts/fleet-power-watch.ts --notify            # print and send for real
bun scripts/fleet-power-watch.ts --state /tmp/p.json # scratch state
bun scripts/fleet-power-watch.ts --self-test         # prove both channels now
```

Exit codes: `0` power is fine, `1` running low, `2` could not read the power
state (pmset missing, or output this does not understand). `2` never spends a
warning. Silence on AC is the designed output, same contract as
[the store watch](./doug-store-watch.md), its freshness check and
[the stranded-work watch](./paperclip-stranded-watch.md).

Needs `POWER_WATCH_SLACK_TOKEN` and `POWER_WATCH_SLACK_CHANNEL` to DM. The phone
leg needs a topic in `~/.paperclip/ntfy-topic`, which the dark watch already
puts there; `POWER_WATCH_NTFY_TOPIC`, `POWER_WATCH_NTFY_TOPIC_FILE`,
`POWER_WATCH_NTFY_URL` and `POWER_WATCH_NTFY_PRIORITY` override it, for a
self-hosted ntfy or a rotation. The plist sets none of them: the defaults are
the production values, so adding the phone leg needed no plist change.

## Schedule

`~/Library/LaunchAgents/com.buildandserve.fleet-power-watch.plist`,
`StartInterval` 300, log at `~/.paperclip/logs/fleet-power-watch.log`, state at
`~/.paperclip/power-watch-state.json`.

```bash
launchctl bootout gui/$UID/com.buildandserve.fleet-power-watch 2>/dev/null
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.buildandserve.fleet-power-watch.plist
launchctl kickstart -p gui/$UID/com.buildandserve.fleet-power-watch
```

The plist, if it ever needs rebuilding:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.buildandserve.fleet-power-watch</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>cd /Users/lacy/repo/buildandserve &amp;&amp; POWER_WATCH_SLACK_TOKEN=$(/opt/homebrew/bin/jq -r '.channels.slack.botToken' /Users/lacy/.openclaw/openclaw.json) POWER_WATCH_SLACK_CHANNEL=U3XC80UUQ /opt/homebrew/bin/bun scripts/fleet-power-watch.ts --notify</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>/Users/lacy/.paperclip/logs/fleet-power-watch.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/lacy/.paperclip/logs/fleet-power-watch.log</string>
</dict>
</plist>
```

launchd, not a Paperclip routine, because Paperclip is downstream of the
battery. A routine that watches the battery dies with it.

## Deliberately not here

- No battery-health history and no graph. The decision is binary: plug in or do
  not.
- No automatic pausing of routines, and no attempt to keep working through
  sleep. Both are much larger jobs and neither is what was missing.
- No "you're back on AC" message. Lacy plugged the cable in; he knows.
- No configurable thresholds. Two numbers, in the source, with tests.

## Delete it when

The fleet no longer runs on one laptop. LAC-3840 and LAC-3841 moved the Keepsake
worker off the Mac for this exact reason, and LAC-4279 is the server that would
finish the job. When nothing client-facing depends on this battery, this file
and its plist go.

## Known gaps

- It warns about battery, not about the other ways the Mac goes away: lid
  closed on AC, a reboot, Wi-Fi dropping. Those are invisible to this file, and
  are now caught after the fact by [the fleet dark watch](./fleet-dark-watch.md),
  which runs on `library` and so survives the Mac dying.
- It is a pre-mortem, and it only works if someone acts on it. Slack alone did
  not get acted on: seven discharge cycles down to 1-7%, every warning
  delivered and every one ignored (LAC-4874, then LAC-6137's 3h32m). The 10%
  Critical Alert is the answer to that, and it still assumes the phone is on,
  charged and in reach. The dark watch is the half that depends on none of it.
- `pmset`'s time estimate is its own guess and swings under changing load. The
  percentage is the number to trust.
