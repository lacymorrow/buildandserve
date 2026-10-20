# Paperclip lease-loss retry

One job: re-run the work the laptop killed while it slept.

`scripts/paperclip-lease-loss-retry.ts`, run by launchd every 5 minutes, reads the
Paperclip Postgres read-only and asks the server to retry any run it reaped with
`Legacy controller lease lost`. When it works, the slot simply runs and nobody is
told anything. Silence means healthy, same contract as
[the store watch](./doug-store-watch.md),
[the stranded-work watch](./paperclip-stranded-watch.md) and
[the power watch](./fleet-power-watch.md).

## Why it exists (LAC-4586)

When this machine sleeps, the Paperclip server process is suspended and every
in-flight run loses its controller lease. On wake the runs are reaped
`setup_failed: Legacy controller lease lost`, and the recovery service parks each
orphaned issue in `blocked` under a recovery action it files on behalf of the
board. That action is never delivered. In
`server/src/services/recovery/service.ts`, `ownerType` falls to `"board"` when no
agent owner resolves:

```ts
ownerType: ownerAgentId ? "agent" : "board",
```

and the wake enqueuer then returns on its first line:

```ts
if (!input.action.ownerAgentId) return;
```

No wake, no message, no retry. `blocked` wakes nobody. The action is a row in
`issue_recovery_actions` whose `next_action` reads "Board operator: inspect the
evidence, then retry the original owner," and no board operator reads those.

### The numbers that justified building this

Measured on the live board over the 7 days to 2026-10-16:

| Class | Created | Stranded | Rate |
|---|---|---|---|
| Routine slots | 57 | 12 | **21%** |
| Manual issues | 308 | 15 | 4.9% |

Routine slots strand 4.3x more often than manual work, and one cause dominates.
8 of those 12 died `setup_failed`, and **15 of the 18 `setup_failed` runs in 14
days carried this one error string**. Per routine:

| Routine | Slots | Stranded |
|---|---|---|
| Lifeboard: draft daily plan | 7 | 3 (**43%**) |
| Doug store watch (every 4h) | 25 | 3 |
| 7 weekly routines | 1 each | 1 each |

All 12 landed `owner_type: board` with `attempt_count: 1`. Not one resolved an
agent owner. Of the 12, 10 ended `cancelled` and 2 `done`: the work never
happened. Two of them are the head of this chain:

- **LAC-4564**, Doug store watch, started 04:00, reaped 05:29. The 9.5h blind
  window in LAC-4568. Its single run was never followed by another.
- **LAC-4565**, Lacy's 06:30 daily plan, reaped 07:31. Three of seven mornings
  that week, the plan did not land and nobody said so.

[The power watch](./fleet-power-watch.md) names the same morning and the same six
reaped runs. That check warns before the machine sleeps.
[The stranded-work watch](./paperclip-stranded-watch.md) reports the park
afterwards. Neither puts the slot back on its feet. This does.

## What it does

A lease-loss reap is infrastructure, not a work failure. Nothing about the run was
wrong, the agent never got control, and a routine slot is reproducible by
definition. So the correct recovery is to run it again, and that is the whole
behaviour:

```
POST /api/agents/:id/wakeup {"reason":"retry_failed_run","failedRunId":"..."}
```

The server rebuilds the original request and scope, so the new run lands back on
the same issue. This is the board's own retry, and the same lever
`~/.paperclip/agent-maxturns-sweep.sh` uses (LAC-4509, prod success on LAC-4520).

It matches `heartbeat_runs.error` against the literal string. A substring match
would also catch lease failures that are not safe to blind-retry.

## The guards

Every reap is decided by `decide()`, ordered most permanent first so the log says
whether a skip will ever clear:

| Skip reason | Meaning | Clears on its own |
|---|---|---|
| `no_issue` | the run carries no issue id | no |
| `issue_terminal` | the issue is `done` or `cancelled` | no |
| `already_retried` | this run already has a retry, ours or the server's | no |
| `superseded` | a later run already started on this issue | no |
| `grace` | reaped under 3 minutes ago | yes |
| `stale` | **requested** over 2 hours ago | no |
| `operator_hold` | agent is `paused`, `terminated` or `pending_approval` | on the operator |
| `agent_busy` | the agent has a queued or running run | yes |
| `agent_retried_this_pass` | this pass already retried a reap for the agent | yes |

Four of these carry the reasoning worth keeping:

- **`stale` at 2 hours, measured from the request.** A stale re-run is worse than
  none: it would draft yesterday's plan, or report a store window a later slot
  already covered. The fastest routine on the board is 4-hourly, so nothing
  inside a 2h window can have been superseded by its own next slot. One rule
  instead of two, and the stricter of the two.

  The clock matters, and it is not the reap. A sleeping machine reaps the run
  whenever it wakes, so the reap lags the request by the length of the sleep.
  LAC-4210 was requested at 04:52:16Z and reaped at 06:52:32Z, two hours later;
  on the reap clock it reads 5 minutes old at its retry and a 2h cap stops
  nothing. The guard takes the older of the two ages, so the cap bounds how stale
  the *work* is and keeps a full 2h of margin against the 4-hourly period. That
  margin was the whole argument for deleting the supersession check (LAC-4608).

  **Add a routine faster than 4-hourly and this has to come down with it.** The
  `MAX_AGE_HOURS < 4` test pins the cap against a hardcoded 4, so it cannot
  notice a 1-hourly routine appearing on the board later.
- **`superseded` is not `already_retried`.** A later routine slot, a board
  comment or a reassignment starts a fresh run on the issue that is nobody's
  retry of anything. Either way the work is moving.
- **`agent_busy` is unbounded on purpose.** Two concurrent runs on one agent is a
  worse failure than a visible delay, so even a stale queued row defers the
  retry. The next pass is 5 minutes away.
- **`agent_retried_this_pass` is the same rule, held within one pass.**
  `agent_busy` is resolved in SQL once before the loop, so it cannot see a retry
  the same pass just posted. Two reaps for one agent minutes apart are real: the
  CEO's LAC-4270 and LAC-4271 were reaped four minutes apart on 2026-10-12, both
  still live. The second waits for the next pass.

An `error` agent is still retried. `error` is invokable in Paperclip, and a lease
loss is a common way for an agent to be left in it, so skipping those would skip
the fleet's worst hours.

Every skip logs once per run per reason per day, state at
`~/.paperclip/lease-loss-retry-state.json`. A reap skipped for the same reason all
day is one line, not 288; a reap whose reason changes says so the moment it
changes. That discipline is LAC-4543, which cost 227 silent skips to learn.

## Run it by hand

```bash
bun scripts/paperclip-lease-loss-retry.ts --dry-run             # decide, do not act
bun scripts/paperclip-lease-loss-retry.ts --dry-run --max-age-hours 336
bun scripts/paperclip-lease-loss-retry.ts --state /tmp/p.json   # scratch state
```

`--max-age-hours` widens both the scan and the `stale` guard, which is how you
replay what the sweep would have done across a longer history. It does not widen
the grace window.

Exit codes: `0` nothing to repair, or repaired. `1` found a reap it could not
retry. `2` could not look. `2` is never logged as `0`.

Needs `PAPERCLIP_DB_URL`. Reads `LEASE_LOSS_RETRY_API`, default
`http://localhost:3100/api`.

## Schedule

`~/Library/LaunchAgents/com.buildandserve.paperclip-lease-loss-retry.plist`,
`StartInterval` 300, log at `~/.paperclip/logs/paperclip-lease-loss-retry.log`.

```bash
launchctl bootout gui/$UID/com.buildandserve.paperclip-lease-loss-retry 2>/dev/null
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.buildandserve.paperclip-lease-loss-retry.plist
launchctl kickstart -p gui/$UID/com.buildandserve.paperclip-lease-loss-retry
```

The plist, if it ever needs rebuilding:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.buildandserve.paperclip-lease-loss-retry</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>cd /Users/lacy/repo/buildandserve &amp;&amp; PAPERCLIP_DB_URL='postgres://paperclip:paperclip@127.0.0.1:54329/paperclip' /opt/homebrew/bin/bun scripts/paperclip-lease-loss-retry.ts</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>/Users/lacy/.paperclip/logs/paperclip-lease-loss-retry.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/lacy/.paperclip/logs/paperclip-lease-loss-retry.log</string>
</dict>
</plist>
```

`RunAtLoad` is the point of the schedule, not a convenience. The reap happens on
wake, and launchd fires this at login and at boot, so the first pass after the
machine comes back is immediate. The 5-minute interval then puts every retry well
inside the 30-minute grace in
[the stranded-work watch](./paperclip-stranded-watch.md), which is why a repaired
slot never produces a Slack DM.

launchd, not a Paperclip routine. The thing being repaired is the thing that
failed, and a routine that depends on the server coming up cleanly cannot repair
the server coming up dirty.

## Deliberately not here

- **No Slack path.** A retry that works is silence. A reap this cannot retry stays
  parked, and the stranded-work watch reports it inside 30 minutes. Two checks
  messaging about one park is noise.
- **No issue writes.** No status PATCH, no comment. The platform re-parks several
  recovery classes seconds after a write, a comment on a parked issue wakes its
  assignee (which is how the LAC-4573 batch queued 30 runs and drove load to
  365), and the run restarting is what actually moves the issue.
- **The watch stays read-only.** Putting this repair inside
  `paperclip-stranded-watch.ts` would have been one fewer job and one fewer log,
  and it was rejected: an alarm that can break itself is a bad alarm. The watch's
  read-only property is load-bearing.
- **No other strand cause.** `configuration_incomplete` and
  `workspace_validation_failed` genuinely need a human. `acpx_turn_failed` (39
  board-owned cases) and `cancelled/transient_failure` (27) might repeat forever
  on a retry, and nothing in the data says which. Those stay with the
  stranded-work watch until there is a number that justifies more.
- **No per-issue retry counter.** "No newer run for this issue" is the same guard
  with no state to keep.

## Tourniquet, not a cure

The real fix is upstream, and it is two things: treat a lost controller lease as
non-terminal and retry the run, and deliver a board-owned recovery action to
somebody instead of filing it as a row. The report is at
[`upstream-lease-loss-strand.md`](./upstream-lease-loss-strand.md). We are READ on
`paperclipai/paperclip` (LAC-4482), so Lacy files it.

Remove this script, its plist and this page once the pinned prod Paperclip retries
a lease-loss reap, and note the removal on LAC-4586.
