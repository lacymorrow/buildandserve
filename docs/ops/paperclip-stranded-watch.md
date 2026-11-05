# Paperclip stranded-work watch

One job: tell Lacy when fleet work has gone quiet and the platform did not say so.

`scripts/paperclip-stranded-watch.ts`, run [once a day from the Paperclip
sweep](#schedule), reads the Paperclip Postgres read-only and Slack-DMs one line
per newly quiet issue.

Two lanes, same failure in two tables:

1. **Parked** work: `blocked` with no blocker. Below, from LAC-4568.
2. **Saved** wakes: a message recorded `deferred_issue_execution` that nothing
   will ever start. [Second lane](#the-second-lane-saved-wakes-that-never-start-lac-6995),
   from LAC-6995.

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
| declared wait | `unblock_descriptor` names the owner and the thing, and no action or an agent-owned one | no |

A declared wait is a person parking work on purpose. Alerting on it would bury
the hundred cases where nobody chose anything.

When an issue has both a descriptor and an active recovery action, the action's
`owner_type` decides which it is:

- **agent-owned** (`deliberate_wait_without_target`) is the platform restating
  the agent's own declared wait. One wait, described twice. Not alerted.
- **board-owned** is still an escalation, descriptor or not. LAC-4085 named
  "when LAC-4177 resolves, re-record"; LAC-4177 went `done` and the issue stayed
  parked, because `blocked` wakes nobody when the named condition comes true.
  Treating a descriptor as proof of health would silence that.
- **system-owned** is still an escalation. `provider_quota` is system-owned, and
  a quota exhaustion is nobody having been told, descriptor or not.

The test is an allowlist (`no action` or `agent`), not "anything but board".
`owner_type` has three live values, measured 2026-11-04: board 5295, agent 1233,
system 40. A fourth value added upstream escalates rather than going quiet,
because the cost is asymmetric: a spurious line is one Lacy ignores, a missed
one is the blind window this script exists for.

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

## The second lane: saved wakes that never start (LAC-6995)

A wake that lands while an issue holds an execution lock is written
`deferred_issue_execution` and the author is told "Your message is saved." It is
saved. Nothing starts it. Unlike the park above there is no `blocked` status, no
recovery action and no card, so the issue reads healthy to every sweep on the
box and to the first lane of this very script.

Measured on the control plane 2026-11-05, every `deferred_issue_execution` row
in the prior 3 days: **21 of 24 produced no run on that issue, ever.**

Why nothing recovers it, in the server source (`2026.1023.0`):

- Promotion is **edge-triggered only**. `runReleaseDrain` has exactly one
  caller, `createReleaseIssueExecution`, i.e. a run on that issue releasing its
  lock. There is no periodic promoter, so a hold that outlives every run on the
  issue strands every wake behind it for good.
- Most holds are a recovery action whose status is already **`resolved`**,
  carrying `evidence.automaticRecovery.replay = 'blocked'`.
  `executionBlockerPredicate()` matches those through an explicit "resolved
  bookkeeping can still carry an effective no-replay hold" branch. 122 such rows
  on 77 issues, 39 non-terminal.
- Of those 122 holds, **105 trace to a run cancelled with error code
  `cancelled`**, i.e. a Stop. Stopping a run leaves a permanent no-replay hold
  on its issue. They therefore arrive in batches: 23 issues went deaf inside one
  minute on 2026-11-03.
- Only a **human** comment retires a hold.
  `admitExplicitNativeContinuation` requires `issueComments.authorType = 'user'`.
  An agent comment, an `issue_assigned`, an `issue_blockers_resolved` or a
  routine slot is saved and unstartable.
- The saved wake is itself why nothing escalates. `hasActiveExecutionPath`
  returns true when a deferred wake exists, and it gates
  `reconcileStrandedAssignedIssues` and `reconcileResolvedDependencyWakeBackstop`.
  The platform's own backstops skip the issue **because** the message is waiting.
- The edge is not reliable either. LAC-2809 had no hold since 2026-10-17 and a
  run released on it at 2026-11-05 10:05Z, and its 2026-11-03 17:37Z wake was
  still deferred 40.5h later. So a cleared hold is not sufficient, and a missing
  hold is never treated as healthy here.

Review gates are the visible victim class, because their only wake is the
`backlog` to `todo` flip or a comment. 6 of the 9 strands in the first live pass
were `Code review:` or `QA:` issues.

The query ignores any issue with a `running`, `queued` or `scheduled_retry` run,
copied from the server's own "is execution active" test: that run's release will
drain it. Everything left has nothing in flight. The same 30-minute grace
applies, so a release drain or a native finalization mid-flight is never named.

One line per strand, keyed on the **oldest** saved wake for that issue and
waiting agent:

```
LAC-6825 (Founding Engineer, 23h, 5 messages saved, held by legacy_execution_requires_reconciliation): Code review: ...
LAC-2809 (Video Producer, 1d, 1 message saved, execution_recovery, hold already gone): Produce Lacy Shell walkthrough video
LAC-6939 (QA Engineer, 18.2h, 1 message saved, deferred behind a run that never released): QA + board approval: ...
```

The strand is the problem, not the count, so a sixth message piling onto a known
strand does not buy a second DM. Two agents waiting on one issue are two
strands: the waiter is usually not the assignee.

**This lane never writes, for a harder reason than the first one.** The hold
means "we could not verify the previous provider stopped". Clearing it blind
invites two providers onto one workspace, which is a live defect of its own
(LAC-6296). The repair is per case and belongs to a person: a human comment on
the issue, or re-filing the work on a fresh issue, which carries no hold because
the hold is keyed to `source_issue_id`. Re-filing is measured: LAC-6894 was
undeliverable for 31h, re-filed as LAC-6999, and its `issue_assigned` wake read
`queued` with a run id 20 seconds later. The whole backlog of nine this check
found on its first pass was drained that way on 2026-11-05 (LAC-7017), eight
re-files, every replacement wake `claimed` or `completed` with a run id.

Three things from that run, for whoever does the next one. Two are
measurements; the third is a pointer:

1. **Reassignment is not a repair.** It looks like one, because it raises a
   fresh `issue_assigned` wake. That wake defers too: promotion is edge-triggered
   on a run release, not on assignment. Tried on four issues (LAC-2809,
   LAC-6973, LAC-7014, LAC-7016), deferred four times, leaving the original
   strand plus a new one. Consistent with edge-triggered promotion; no run
   released in between on any of the four, so the four observations do not by
   themselves rule out a second explanation. The mechanism half is the part with
   code behind it (`runReleaseDrain` above). Only a fresh issue id clears it.
2. **Assert `HTTP 201` and a different identifier before cancelling the
   original.** Observed 2026-11-05: a `POST /api/companies/{id}/issues` whose
   title matched a non-terminal issue returned `HTTP 200` and that *existing*
   issue's identifier; the same body returned `201` with a new identifier once
   the original was `cancelled`. **The key was not isolated** - it could be
   title, title+assignee, title+project, or a time window, and three same-title
   re-files in the same batch got `201` against originals 1 to 4 months old,
   which fits a window as well as it fits title. A code read for a create-time
   title de-dupe found none, on a checkout that may predate the running build.
   So treat the trigger as unproven and the hazard as real: a script that reads
   only `issue.identifier` off a `200` will cancel the very issue it meant to
   replace, which happened to three issues on that pass (recovered by
   re-creating once the originals were terminal). The assertion is right
   whatever the key turns out to be, and it makes either order safe.
3. **Not every strand needs a repair, and one of them must not get one.** See
   the supersession gap below.

## Run it by hand

```bash
export PAPERCLIP_DB_URL='postgres://paperclip:paperclip@127.0.0.1:54329/paperclip'
bun scripts/paperclip-stranded-watch.ts                  # print, do not DM
bun scripts/paperclip-stranded-watch.ts --notify          # print and DM
bun scripts/paperclip-stranded-watch.ts --state /tmp/s.json   # scratch state
```

Exit codes: `0` nothing parked and nothing stranded, `1` either lane found
something, `2` could not look (missing `PAPERCLIP_DB_URL`, database
unreachable). `2` never consumes an alert, and a failure in either query is a
`2`: half a board reported as healthy is the thing this file exists to prevent.

A **standing** stale-deploy line (already reported, so nothing new to say) exits
`0`, not `1`. The code means "something is parked", the sweep discards anything
under `2`, and that path DMs nobody, so a `1` there would be a claim with no
reader contradicting this table. A stale deploy that is *news* rides the `1`,
because that run did tell someone.

Both lanes share one state file and one DM. Two notifiers on one launchd tick
would mean two Slack calls and two chances for one lane's outage to eat the
other lane's alert.

Needs `STRANDED_WATCH_SLACK_TOKEN` and `STRANDED_WATCH_SLACK_CHANNEL` to DM.
Silence from a healthy board is the designed output, same contract as
[the store watch](./doug-store-watch.md) and its freshness check.

## Schedule

Once a day, from `~/.paperclip/paperclip-sweep.sh`, in the first 10-minute tick
after 08:00 local. It has **no plist of its own**; the rule on this host is that
a new Paperclip workaround gets a line in that script, never its own launchd
agent. A day stamp at `~/.paperclip/logs/.stranded-watch-day` holds it to one run
per day, log at `~/.paperclip/logs/paperclip-stranded-watch.log`, state at
`~/.paperclip/stranded-watch-state.json`.

To force today's run again (after a fix, or when the report looks wrong):

```bash
rm -f ~/.paperclip/logs/.stranded-watch-day   # next sweep tick re-runs it, <=10 min
```

Scheduled outside Paperclip, not by a Paperclip routine, for the same reason as
the freshness check: Paperclip is the thing that fails. It was down for two hours
the morning this was written.

### Which copy runs, and why that is a check and not a detail

The sweep runs it from **`~/repo/buildandserve-ops`**, a checkout that tracks
`main` and nothing else, and pulls `--ff-only` before each run. That is the same
shape as the four launchd watches on this host (`store-watch-freshness`,
`paperclip-lease-loss-retry`, `fleet-power-watch`, `tailscale-watchdog`).

It used to run from `~/repo/buildandserve`, the shared checkout sessions and
agents actually work in. On 2026-11-05 that checkout was parked on branch
`LAC-5692/brand-implementation` with a copy of this script dated 2026-10-17, so
**both of this ticket's own merged fixes had never run**: PR #58 (the `owner_type`
allowlist, merged 2026-11-04) and PR #108 (the deferred-wake lane, merged
2026-11-05). The daily DM kept arriving on schedule, produced by pre-#58 logic.
Nothing was broken in a way anyone could see, which is this script's own subject
matter pointed at itself.

So the script now reads its own checkout (`git rev-parse HEAD` vs
`origin/main`, in the directory of `import.meta.path`, not the process cwd) and
puts a line at the top of the report when they differ, or when git cannot be read
at all. That line is deduped on the (running commit, `origin/main`) pair, so a
stale deploy is reported once rather than every day. It depends on the
invocation's `--ff-only` pull for a fresh `origin/main`: run by hand without one
and a stale `origin/main` can read as a match, which is a false negative and
never a false positive.

## Delete it when

The platform retries a run that died before the agent got control, or tells the
owner of a recovery action that it filed one. The second lane goes when a
deferred wake is promoted on a timer rather than only on a run release, or when
a stuck hold raises to someone. Then this file and its plist go,
and the removal gets noted on LAC-4568. Tracked with LAC-4513 and LAC-4514; all
three wait on the LAC-4482 decision about shipping platform patches.

## Known gaps

- **The lane's one standing row, LAC-6939, is a TRUE positive. An earlier
  version of this entry called it a false positive and prescribed two
  suppressors for it. Both were wrong, and the retraction is the useful part.**
  The wrong reasoning, kept so nobody re-derives it: its QA Engineer wake
  deferred 2026-11-04 21:05Z, the QA Engineer commented a verdict on that same
  issue at 21:07Z, so the waiting agent looked like it had got control another
  way and nothing looked lost. What killed that reading, measured on LAC-7040 /
  PR #110 (2026-11-05, Backend Engineer's trace of the server, reviewed):
  - The 21:07Z comment came from run `b1461494`, **started 21:04:16Z, before
    the 21:05:02Z wake**. No run on that issue started after the wake. So that
    comment is not evidence the saved message was read; under the suppressor's
    own rule the row stays.
  - Promotion does not require the waiter to be the assignee.
    `heartbeat.ts` 12812-12960 and 13037-13070 build a queued run for
    `deferred.agentId` with no assignee check; the assignee guard is on the lock
    update at 13069 only. The start gate at 9483 cancels `issue_assignee_changed`
    only when `!isInteractionWake`, and 2669-2675 make this wake an interaction
    wake (`wakeReason: issue_commented` with a comment id). LAC-6939 has no
    assignee, and promotion would still have started QA on it. Nothing did.
  - So the saved message is genuinely never-started, and a
    waiter-is-not-assignee suppressor is rejected on its own terms: 5 of the 29
    deferred wakes on the board have waiter != assignee and would be hidden.
  Caveat carried from that trace, not independently checked: the `paperclip`
  checkout read is dated 2026-10-20, so the running server could differ.
  **Disposition: the row clears when LAC-6939 reaches a terminal status, and
  that is Lacy's approval decision, not an agent's write.** The lane filters
  `i.status NOT IN ('done','cancelled')`, so approving or rejecting the stage
  removes the row with no suppressor at all. Until then it is a correct alarm
  about a real waiting message, and it must never be re-filed.
  Re-filing destroys the live board `approval` stage it carries
  (`reviewAttention` responder `Board` since 21:17Z), which is the one path Lacy
  has to it on client-visible work. PR #110 (the run-start suppressor) is sound
  code with nothing live to exercise it and was closed unmerged under Rule 26;
  LAC-7040 is cancelled as not-a-bug. The real gap the lane still has is the
  general one in the bullet above it: a wake is promoted only on a run release,
  never on a timer.
- Read-only on purpose. It never unparks anything. Unparking 100 issues at once
  would stampede the fleet, and the platform re-parks `configuration_incomplete`
  seconds after a write. This property is load-bearing and stays: an alarm that
  can break itself is a bad alarm. The repair lives in a separate job,
  [the lease-loss retry](./paperclip-lease-loss-retry.md), which re-runs the one
  strand cause where retrying is unambiguously right. A slot it repairs inside
  the 30-minute grace above never reaches this check at all, which is the
  intended division: that job fixes, this one tells.
- It watches the board, not the machine. The laptop sleeping at 1% battery is
  what started this, and nothing here notices that.
  [The fleet power watch](./fleet-power-watch.md) is the machine half: it warns
  before the battery runs out, so this one has less to report afterwards.
- The GHOST company (`6002a0d1-…`, split 2026-09-24) is skipped; its 25 blocked
  issues are a frozen copy.
- The second lane joins wakes to issues on `payload ->> 'issueId'` as text, not
  a `uuid` cast, so a wake with a missing or malformed `issueId` is invisible
  rather than fatal. That trade is deliberate: one bad payload casting would
  take the whole check down, and a check that can kill itself is a bad alarm.
- Neither lane can see a strand on an issue that also holds a live run. That is
  the correct default (the release drains it) but it is an assumption, not a
  verification.
