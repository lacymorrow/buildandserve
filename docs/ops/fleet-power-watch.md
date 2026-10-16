# Fleet power watch

One job: tell Lacy before the laptop sleeps and takes the whole fleet with it.

`scripts/fleet-power-watch.ts`, run by launchd every 5 minutes, reads
`pmset -g batt` and Slack-DMs one line when the Mac is on battery and getting
low. Once below 20%, once below 10%, nothing more until it is back on AC.

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

| Battery | On battery | Sent |
|---|---|---|
| 21% | yes | nothing |
| 18% | yes | first DM |
| 14% | yes | nothing |
| 8% | yes | second DM |
| 3% | yes | nothing |
| any | plugged in | nothing, and the two warnings rearm |

AC is the only thing that rearms it, so a long discharge produces two messages
rather than twenty. Crossing both thresholds between two checks (the Mac was
asleep, or this was installed mid-discharge) spends both and sends one message,
not two.

A machine with no battery reports as permanently fine, so the same file is safe
on the Hetzner box (LAC-4279).

## Run it by hand

```bash
bun scripts/fleet-power-watch.ts                    # print, do not DM
bun scripts/fleet-power-watch.ts --notify            # print and DM
bun scripts/fleet-power-watch.ts --state /tmp/p.json # scratch state
```

Exit codes: `0` power is fine, `1` running low, `2` could not read the power
state (pmset missing, or output this does not understand). `2` never spends a
warning. Silence on AC is the designed output, same contract as
[the store watch](./doug-store-watch.md), its freshness check and
[the stranded-work watch](./paperclip-stranded-watch.md).

Needs `POWER_WATCH_SLACK_TOKEN` and `POWER_WATCH_SLACK_CHANNEL` to DM.

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
  closed on AC, a reboot, Wi-Fi dropping. Those stay invisible.
- `pmset`'s time estimate is its own guess and swings under changing load. The
  percentage is the number to trust.
