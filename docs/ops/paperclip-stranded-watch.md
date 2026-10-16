# Paperclip stranded-work watch

One job: tell Lacy when fleet work has gone quiet and the platform did not say so.

`scripts/paperclip-stranded-watch.ts`, run by launchd every 15 minutes, reads the
Paperclip Postgres read-only and Slack-DMs one line per newly parked issue.

## Why it exists (LAC-4568)

Paperclip parks an issue in `blocked` when a run dies before the agent gets
control. That park is deliberate: the platform files a `stranded_assigned_issue`
recovery action with `ownerType: "board"` and a next action that reads "Board
operator: inspect the evidence, then retry the original owner." It sends no
message. `blocked` wakes no assignee. So the platform hands Lacy a job and never
tells him.

On 2026-10-16 the laptop slept at 1% battery. The 08:00Z Doug store watch slot
(LAC-4564) died mid-setup with `setup_failed: Legacy controller lease lost`, was
parked at 09:29Z, and was never retried. Doug's stores went unwatched for 9.5h.
When this check was written the board held **128** such issues: 101 escalated to
a board owner who was never told, 27 with no wake path at all, the oldest 132
days.

## What it reports

An issue counts as parked when it is `blocked` and has no unresolved first-class
blocker. Three outcomes:

| Class | Meaning | Alerted |
|---|---|---|
| escalated | an active recovery action owns it, nobody was told | yes |
| orphaned | no recovery action, no declared wait, nothing will wake it | yes |
| declared wait | `unblock_descriptor` names the owner and the thing | no |

A declared wait is a person parking work on purpose. Alerting on it would bury
the hundred cases where nobody chose anything.

A park younger than 30 minutes is ignored: platform revalidation clears a
transient one in seconds, and an agent mid-PATCH holds the state for a moment.

## Reading the alert

First run counts the backlog instead of listing it, and says the listing starts
now. Every run after that names up to 5 new parks, one line each:

```
LAC-4564 (Founding Engineer, 4.5h, stranded_assigned_issue): Doug store watch (every 4h, read-only)
```

One DM per park. The dedupe key is the issue plus the moment it parked, so a
park that lasts a week produces one message, and the same issue parking again
later produces another.

## Run it by hand

```bash
export PAPERCLIP_DB_URL='postgres://paperclip:paperclip@127.0.0.1:54329/paperclip'
bun scripts/paperclip-stranded-watch.ts                  # print, do not DM
bun scripts/paperclip-stranded-watch.ts --notify          # print and DM
bun scripts/paperclip-stranded-watch.ts --state /tmp/s.json   # scratch state
```

Exit codes: `0` nothing parked, `1` something is, `2` could not look (missing
`PAPERCLIP_DB_URL`, database unreachable). `2` never consumes an alert.

Needs `STRANDED_WATCH_SLACK_TOKEN` and `STRANDED_WATCH_SLACK_CHANNEL` to DM.
Silence from a healthy board is the designed output, same contract as
[the store watch](./doug-store-watch.md) and its freshness check.

## Schedule

`~/Library/LaunchAgents/com.buildandserve.paperclip-stranded-watch.plist`,
`StartInterval` 900, log at `~/.paperclip/logs/paperclip-stranded-watch.log`,
state at `~/.paperclip/stranded-watch-state.json`.

```bash
launchctl bootout gui/$UID/com.buildandserve.paperclip-stranded-watch 2>/dev/null
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.buildandserve.paperclip-stranded-watch.plist
launchctl kickstart -p gui/$UID/com.buildandserve.paperclip-stranded-watch
```

Scheduled by launchd, not by a Paperclip routine, for the same reason as the
freshness check: Paperclip is the thing that fails. It was down for two hours the
morning this was written.

## Delete it when

The platform retries a run that died before the agent got control, or tells the
owner of a recovery action that it filed one. Then this file and its plist go,
and the removal gets noted on LAC-4568. Tracked with LAC-4513 and LAC-4514; all
three wait on the LAC-4482 decision about shipping platform patches.

## Known gaps

- Read-only on purpose. It never unparks anything. Unparking 100 issues at once
  would stampede the fleet, and the platform re-parks `configuration_incomplete`
  seconds after a write.
- It watches the board, not the machine. The laptop sleeping at 1% battery is
  what started this, and nothing here notices that.
- The GHOST company (`6002a0d1-…`, split 2026-09-24) is skipped; its 25 blocked
  issues are a frozen copy.
