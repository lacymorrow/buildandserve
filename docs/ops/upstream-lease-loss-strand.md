# Upstream bug: a lost controller lease strands the issue, and the board-owned recovery action is never delivered

**Product:** paperclipai, server `2026.1012.0`, local control plane on `:3100`
**Severity:** High. Silent, recurring loss of scheduled work, with no signal anywhere.
**For:** `paperclipai/paperclip`. We are READ there (LAC-4482), so this is written for the operator to file.
**Prepared by:** CTO agent, 2026-10-16, tracked as LAC-4586.

## Summary

Two defects compound. Either alone would be survivable.

1. **A run reaped for losing its controller lease is never retried.** The host
   machine sleeps, the server process is suspended, in-flight runs lose their
   lease, and on wake each is finalized `failed` with
   `error_code: setup_failed`, `error: "Legacy controller lease lost"`. The agent
   never received control. Nothing about the work failed. No retry is scheduled.

2. **The recovery action filed for the orphaned issue is delivered to nobody.**
   The issue is parked `blocked` and an `issue_recovery_actions` row is written
   with `owner_type: "board"` and a `next_action` of "Board operator: inspect the
   evidence, then retry the original owner." No wake is enqueued, no notification
   is sent, and `blocked` wakes no assignee. The action is a row in a table that
   nothing surfaces.

Net effect: a scheduled routine silently stops producing, indefinitely, and the
only way to find out is to query Postgres.

## Evidence

Measured on one live board over the 7 days to 2026-10-16.

**Strand rate.** Routine-generated issues strand 4.3x more often than manual
ones, because a routine slot is more likely to be mid-run when the machine sleeps:

| `origin_kind` | Created | Stranded | Rate |
|---|---|---|---|
| `routine_execution` | 57 | 12 | 21% |
| `manual` | 308 | 15 | 4.9% |

**One cause dominates.** 8 of those 12 died `setup_failed`, and 15 of the 18
`setup_failed` runs in 14 days carried the identical error string:

```sql
SELECT r.error, count(*)
  FROM heartbeat_runs r
 WHERE r.error_code = 'setup_failed'
   AND r.created_at > now() - interval '14 days'
 GROUP BY 1 ORDER BY 2 DESC;
-- "Legacy controller lease lost"  15
-- (two unrelated git/workspace failures)  3
```

**Per routine.** The worst is a daily 06:30 planning routine that lost 3 of 7
slots. Its output is a human's morning plan, so each lost slot is a day that plan
did not exist and nobody was told:

| Routine | Slots | Stranded |
|---|---|---|
| Lifeboard: draft daily plan | 7 | 3 (43%) |
| Doug store watch (every 4h) | 25 | 3 |
| 7 distinct weekly routines | 1 each | 1 each |

**No agent owner ever resolved.** All 12 landed:

```json
{"owner_type": "board",
 "attempt_count": 1,
 "wake_policy": {"type": "board_escalation",
                 "reason": "stranded_assigned_issue",
                 "preservesSourceAssignee": true}}
```

This is not a configuration problem on our side. The same board resolved an
**agent** owner for 490 recovery actions of the same two causes, with
`attempt_count` reaching 12, so the agent-owned path works and is well exercised.
The board-owned path is the one with no delivery.

**Outcome of the 12:** 10 `cancelled`, 2 `done`. None of the work was performed.

**The clean single case.** Issue LAC-4564, a 4-hourly read-only store check:

| | |
|---|---|
| run `9742cd51-bebc-4aef-87d2-ae5f59c9e0aa` | started `2026-10-16 08:00:20Z` |
| reaped | `2026-10-16 09:29:17Z`, `setup_failed: Legacy controller lease lost` |
| runs on that issue afterwards | **none, ever** |
| issue status | `blocked`, with a board-owned `stranded_assigned_issue` action |
| discovered | 9.5 hours later, by a human reading the database |

Host sleep log for the same window, confirming the trigger:

```
2026-10-16 07:31:24 -0400 Sleep  Entering Sleep state due to 'Low Power Sleep' ... (Charge:1%)
2026-10-16 09:30:51 -0400 Wake   Wake from Hibernate [CDNVA] : due to charger/UserActivity
```

## Root cause in the source

`server/src/services/recovery/service.ts`, in
`ensureSourceScopedStrandedRecoveryAction`:

```ts
ownerType: ownerAgentId ? "agent" : "board",
```

and immediately after, in `enqueueSourceScopedStrandedRecoveryWake`:

```ts
if (!input.action.ownerAgentId) return;
```

So the `board` branch is the branch with no delivery mechanism at all. The
fallback `wake_policy` the code writes for it is honest about this:

```ts
{ type: "board_escalation", reason: "no_invokable_recovery_owner" }
```

`board_escalation` has no consumer. Nothing reads that policy and notifies
anyone.

Separately, `issues.blocked_owner_notified_at` exists in the schema and looks
like the intended hook, but is non-null on only **16 of 6251** issues, newest
`2026-10-14`, none of them from this path. Whatever writes it is not reached here.

## Suggested fixes

1. **Treat a lost controller lease as non-terminal and retry the run.** This is
   the high-value one. The lease is infrastructure state; losing it carries no
   information about the work. The same reasoning already applies to
   `provider_quota` and workspace-sync conflicts, which pass `keepIdleOnFailure`
   in `finalizeAgentStatus` (`server/src/services/heartbeat/run-completion.ts`).
   A lease loss belongs in that set. Bound it with a small per-run attempt cap so
   a host that keeps sleeping cannot loop.

2. **Give `board_escalation` a delivery path, or stop writing it.** A recovery
   action nobody can receive is worse than no recovery action, because the issue
   looks handled. Options, cheapest first:
   - Write `issues.blocked_owner_notified_at` and emit on the company's existing
     notification channel when an action is filed with `owner_type: "board"`.
     The column already exists.
   - Surface board-owned active recovery actions in the UI as an inbox rather
     than only on each issue.
   - Fall back to the source assignee with a bounded attempt count when no
     manager owner resolves. The assignee is already preserved in
     `return_owner_agent_id` and `preservesSourceAssignee: true`.

3. **For routine-generated issues, prefer re-running over parking.** A routine
   slot is reproducible and time-boxed, which makes "board operator inspects the
   evidence" the wrong default. Re-run it if its window is still open; cancel it
   with a reason if a later slot has superseded it. Parking it forever is wrong
   in both directions: it hides the miss and it fills the blocked queue. 52 of
   128 parked issues on this board were routine slots across 12 active routines.

## Query to reproduce the fingerprint

```sql
SELECT r.id, r.error_code, r.error, i.identifier, i.status, i.origin_kind,
       ra.owner_type, ra.wake_policy
  FROM heartbeat_runs r
  LEFT JOIN issues i ON i.id::text = r.context_snapshot ->> 'issueId'
  LEFT JOIN issue_recovery_actions ra
         ON ra.source_issue_id = i.id AND ra.status = 'active'
 WHERE r.error = 'Legacy controller lease lost'
   AND r.created_at > now() - interval '30 days'
 ORDER BY r.created_at;
```

Then confirm that no later run exists for any of those issues:

```sql
SELECT n.id FROM heartbeat_runs n
 WHERE n.context_snapshot ->> 'issueId' = '<issue id>'
   AND n.created_at > '<reap time>';
```

## Operator mitigation in place

`scripts/paperclip-lease-loss-retry.ts` in this repo, launchd every 300s, reads
Postgres read-only and posts the server's own
`POST /api/agents/:id/wakeup {"reason":"retry_failed_run","failedRunId":"..."}`
for any lease-loss reap whose issue is still live, under a 2-hour staleness
window so a stale slot is never re-run. Runbook:
[`paperclip-lease-loss-retry.md`](./paperclip-lease-loss-retry.md).

It is a stopgap. It should be removed once fix 1 lands.
