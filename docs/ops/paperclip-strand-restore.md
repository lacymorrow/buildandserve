# Paperclip strand restore

One job: put back the work a bulk agent pause knocked over.

`scripts/paperclip-strand-restore.ts`, run from `~/.paperclip/paperclip-sweep.sh`
every 10 minutes, reads the Paperclip Postgres and restores issues parked under an
undelivered `stranded_assigned_issue` recovery action whose owner is healthy again.
When it works, the issue simply goes back on the board and nobody is told
anything. Silence means healthy, same contract as
[the lease-loss retry](./paperclip-lease-loss-retry.md),
[the store watch](./doug-store-watch.md),
[the stranded-work watch](./paperclip-stranded-watch.md) and
[the power watch](./fleet-power-watch.md).

## Why it exists (LAC-5079)

Pausing an agent kills its in-flight run. The run dies before the agent gets
control back, so the recovery service parks the issue in `blocked` under a
recovery action it files on behalf of the board, and that action is never
delivered: in `server/src/services/recovery/service.ts`, `ownerType` falls to
`"board"` when no agent owner resolves, and the wake enqueuer then returns on its
first line when there is no owner agent. No wake, no message, no retry. Same
undelivered-action defect as [LAC-4586](./paperclip-lease-loss-retry.md),
different cause.

The pause is reversible. Its damage is not, and that is the whole bug.

### The numbers that justified building this

Lacy paused 14 of 22 agents on 2026-10-18 between 07:00:26Z and 07:00:38Z. Seven
`stranded_assigned_issue` actions were filed in those twelve seconds. The hold was
lifted the same day; two days later, with nobody paused, all seven were still live
and none of the seven issues had moved:

| Issue | Owner | Parked | Previous status |
|---|---|---|---|
| LAC-4837 | Founding Engineer | 2026-10-18T07:00:31Z | `todo` |
| LAC-3818 | Founding Engineer | 2026-10-18T07:00:33Z | `in_progress` |
| LAC-3458 | Founding Engineer | 2026-10-18T07:00:34Z | `in_progress` |
| LAC-1912 | Founding Engineer | 2026-10-18T07:00:34Z | `in_progress` |
| LAC-2361 | Founding Engineer | 2026-10-18T07:00:35Z | `in_progress` |
| LAC-3457 | Founding Engineer | 2026-10-18T07:00:35Z | `in_progress` |
| LAC-4822 | Backend Engineer | 2026-10-18T07:00:43Z | `in_progress` |

Every one carries `latestRunErrorCode: agent_paused` or a run cancelled at the
pause, and `wake_policy.type: board_escalation`, which is the type nothing
delivers.

### Why the lease-loss retry does not cover it

Two independent reasons, either one sufficient:

1. `paperclip-lease-loss-retry.ts` matches `error = 'Legacy controller lease lost'`
   literally, by design. A pause-killed run carries `agent_paused` instead.
2. Even if it matched, that script's `stale` guard caps retries at 2h from the
   request. These parks are days old, so every one would be skipped, correctly.

A paused agent is also an explicit `operator_hold` skip there, which is right: do
not fight an operator hold. The gap is that nothing un-does the hold's collateral
damage once the operator lifts it.

## The lever

`PATCH /api/issues/:id {status}`. The platform recognises the write and does the
rest itself: it cancels the stranded action with "Recovery action became stale
because the source issue was manually moved from blocked to todo", and its own
liveness dispatch queues the run. Nothing synthetic, no `POST /wakeup`, and no
second wake path to keep working.

Verified on LAC-4837 at 2026-10-20T17:21Z:

```
LAC-4837 todo v3 2026-10-20T17:22:38Z
stranded_assigned_issue cancelled cancelled  Recovery action became stale because
  the source issue was manually moved from blocked to todo.
run queued 2026-10-20T17:22:38.907Z
```

Status still `todo` 100 seconds later, so it was not re-parked. The run queued
0.5s after the write, which is the assignee actually being woken.

Two things that are **not** true here, despite looking identical in a
point-in-time query, and both measured rather than assumed:

- **A raw `UPDATE issues SET status` does not stick.** The server re-derives
  status and bumps `status_version` back over it. Writes go through the API
  (measured in `phantom-block-sweep.sh`, LAC-4910).
- **`phantom-block-sweep.sh` says "do NOT PATCH" an issue with any active
  recovery action.** That holds for `active_run_watchdog` and
  `configuration_incomplete`, which re-park inside ~2s and were what it measured.
  It does not hold for `stranded_assigned_issue`, which cancels and stays
  cancelled. The two causes need opposite treatment, which is why this is a
  separate file rather than a relaxed predicate over there.

## It restores to `todo`, not to the recorded previous status

The one place it does not simply replay what the platform recorded. Six of the
seven parks above carry `evidence.previousStatus = "in_progress"`, and writing
that back would be a lie about reality: the run is dead, there is no session to
resume, and nothing in Paperclip dispatches an assigned `in_progress` issue, so it
would trade a visible park for an invisible stall.

`todo` means "assigned, not started", which is exactly true after a pause killed
the run, and it is the only dispatch this board has same-day observations of: 16
parks moved `blocked` -> `todo` at 2026-10-20T16:28:30-37Z, all 16 actions
cancelled with the stale note, and 16 runs queued on their assignees.

`in_review` and `backlog` parks are **skipped** rather than rewritten. `todo` on
an `in_review` issue would send an engineer back into work a reviewer already
holds, and `backlog` wakes nobody either way. They stay parked and
`paperclip-stranded-watch.ts` reports them.

## Rate limiting is a headroom test, not an idleness test

Restoring the backlog at once is the failure mode, not the fix. The LAC-4573 batch
queued ~30 runs and drove load to 365; the 16:28Z batch above left Founding
Engineer 16 runs deep.

But "skip while the owner is busy" would never drain a saturated agent, and the
agent holding six of the seven parks is saturated *because of them*. So the gate is
queue depth:

| Cap | Value | What it bounds |
|---|---|---|
| `MAX_AGENT_QUEUE` | 3 | Outstanding runs an owner may have and still receive a restore |
| per owner per pass | 1 | Six parks sharing one owner cannot all land at once |
| `MAX_PER_PASS` | 3 | Board-wide, so one pass cannot storm across owners either |
| `MAX_RESTORES_PER_ISSUE` | 3 | An issue that keeps re-parking is not a strand this can clear |

At the 10-minute sweep cadence that drains 6/hour/owner into owners that have
room, and stalls by design while the board is full. A permanently saturated owner
never drains, which is visible rather than silent: the parks stay parked and the
stranded watch reports them daily.

## Staleness is decided on the issue, not on the age

Deliberately **no maximum age**. Unlike a routine slot, a manual issue parked for
two days is usually still worth doing, so copying LAC-4586's 2h cap would skip
every park this exists to fix. Staleness is decided on facts about the work
instead: a terminal issue, a live blocker or a newer run all stop the restore.

Routine slots are skipped outright. A routine slot is reproducible by definition
and its next slot supersedes it, so re-running a stale one would report a window
something else already covered. Fresh ones are the lease-loss retry's job, inside
its 2h window. All seven `stranded_assigned_issue` routine parks live on the LACA
board on 2026-10-20, which is excluded anyway.

## It never comments

A comment on a parked issue fires `issue_reopened_via_comment` and wakes the
assignee, which would be a second uncounted wake on top of the one the status
change already causes (LAC-4573). The status PATCH is the only write.

## Guards

Resolved in SQL, applied in `decide()`, ordered most permanent first so the log
reads as a reason rather than a race:

| Skip reason | Why |
|---|---|
| `not_parked` | The issue moved; `blocked` is no longer the thing being repaired |
| `previous_status_not_restorable` | `in_review` / `backlog` / unrecorded; see above |
| `routine_slot` | Superseded by its next slot |
| `live_blocker` | Genuinely blocked; the park is correct |
| `assignee_owns_unblock` | The assignee named themselves the unblock owner |
| `other_recovery_action` | Also parked by e.g. `configuration_incomplete`, which needs a human |
| `pending_card` | Restoring would wake an agent into a human wait |
| `superseded` | A run already started on the issue after the park |
| `restore_exhausted` | Three restores spent; hammering it would be a loop |
| `grace` | Parked under 10 minutes; let the platform's own handling finish |
| `no_owner` | `todo` plus unassigned wakes nobody (LAC-3260) |
| `owner_on_hold` | The hold is still in force; its collateral is the operator's to keep |
| `agent_queue_full` | No headroom |
| `agent_restored_this_pass` | Queue depth is read once per pass and cannot see this pass's writes |
| `pass_cap_reached` | Board-wide cap |

The LACA board is excluded by company id. It split off on 2026-09-24 and the real
company runs on another machine, so its parks are a frozen copy and not ours to
repair.

## Running it

```bash
PAPERCLIP_DB_URL='postgres://paperclip:paperclip@127.0.0.1:54329/paperclip' \
  bun scripts/paperclip-strand-restore.ts --dry-run
```

| Env | Default | Notes |
|---|---|---|
| `PAPERCLIP_DB_URL` | none, required | Fails loudly rather than repairing the wrong database |
| `STRAND_RESTORE_API` | `http://localhost:3100/api` | Board mode on localhost needs no token |
| `STRAND_RESTORE_API_KEY` | unset | A LAC agent key, for running it off zero |

State lives at `~/.paperclip/strand-restore-state.json`: restore counts per issue
(aged out after 14 days, so an issue that strands again next month gets its three
tries back) and one skip key per issue per reason per day, so a park skipped for
the same reason all day is one log line rather than 144.

Exit codes: `0` nothing to restore, or restored. `1` a park it could not write.
`2` could not look.

## Retiring it

Tourniquet, not a cure. The real fix is upstream: deliver a board-owned recovery
action to somebody, and treat an operator pause as *suspending* in-flight work
rather than killing it. We are READ on `paperclipai/paperclip` (LAC-4482), so the
report lives with the LAC-4586 one at
[`upstream-lease-loss-strand.md`](./upstream-lease-loss-strand.md) for Lacy to
file.

Remove this script, its test and its line in `~/.paperclip/paperclip-sweep.sh`
once the pinned prod Paperclip restores its own pause collateral, and note the
removal on LAC-5079.
