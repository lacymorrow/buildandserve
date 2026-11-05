#!/usr/bin/env bun
/**
 * Tells Lacy when fleet work has gone quiet (LAC-4568).
 *
 * Paperclip parks an issue in `blocked` when a run dies before the agent got
 * control. The park is deliberate: a `stranded_assigned_issue` recovery action
 * is filed with `ownerType: "board"` and a next action that reads "Board
 * operator: inspect the evidence, then retry the original owner." But `blocked`
 * wakes nobody, the recovery action is a row in a table, and no message is sent.
 * So the platform assigns Lacy a job and never tells him it did.
 *
 * On 2026-10-16 the laptop slept at 1% battery. The 08:00Z Doug store watch
 * slot (LAC-4564) died mid-setup, got parked that way at 09:29Z, and was never
 * retried. Doug's stores went unwatched for 9.5 hours. When this check was
 * written, 101 issues were sitting in that state and 27 more had no wake path
 * at all, the oldest from July.
 *
 * Since 2026-11-05 it watches a second shape of the same failure: a wake
 * recorded `deferred_issue_execution`, where the author is told the message is
 * saved and nothing ever starts it. See `DeferredWake` below for the mechanism
 * and the measurements (LAC-6995). That lane has no `blocked` status, no
 * recovery action and no card, so none of the checks above can see it.
 *
 * Two properties make it worth having, both borrowed from the sibling check in
 * `doug-store-watch-freshness.ts`:
 *
 * 1. **It does not run inside Paperclip.** Paperclip is the thing that fails,
 *    and the morning this was written it was down for two hours. launchd runs
 *    this, and it reads Postgres directly, so a dead control plane cannot take
 *    the alarm down with it.
 * 2. **It never writes to the board.** Read-only, by design. Unparking 100
 *    issues at once would stampede the fleet, and the platform re-parks some
 *    classes seconds after a write. Surfacing is the half that is missing.
 *
 * Usage:
 *   bun scripts/paperclip-stranded-watch.ts [--notify] [--state <path>]
 *
 * Exit codes: 0 = nothing went quiet, 1 = something did (either lane), 2 =
 * could not look.
 *
 * Silence means healthy, same contract as the watch and the freshness check.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

/**
 * A park younger than this is still the platform's own business: revalidation
 * clears a transient one within seconds, and an agent mid-PATCH holds the state
 * for a moment while relations land. Half an hour is far past either, and still
 * well inside the 4h cadence of the slowest thing being watched.
 */
export const GRACE_MINUTES = 30;

/** Named in the DM. Past this the list stops being readable and becomes a wall. */
export const MAX_NAMED = 5;

/**
 * Split off on 2026-09-24; the real company runs on another machine. Its 25
 * blocked issues are a frozen copy, so alerting on them is pure noise.
 */
const GHOST_COMPANY_ID = "6002a0d1-a96a-4495-ae4f-dd26400d9602";

const DEFAULT_STATE_PATH = path.join(
  process.env.HOME ?? ".",
  ".paperclip",
  "stranded-watch-state.json"
);

/** One row of the query: an issue in `blocked` with no unresolved blocker. */
export interface BlockedIssue {
  identifier: string;
  title: string;
  assignee: string;
  strandedSinceMs: number;
  /** `cause` of the active recovery action, or "" when there is none. */
  recoveryCause: string;
  /** `owner_type` of that action: "board", "agent", or "" when there is none. */
  recoveryOwner: string;
  /** True when the issue declares who it is waiting on and what for. */
  hasDescriptor: boolean;
}

export interface Verdict {
  /** Parked under a recovery action whose owner was never told. */
  escalated: BlockedIssue[];
  /** No recovery action, no declared wait: nothing will ever wake it. */
  orphaned: BlockedIssue[];
  /** Deliberate waits. Counted, never alerted on. */
  declared: BlockedIssue[];
  /** Parked too recently to judge. */
  young: number;
}

/** Stable while one park lasts; different the next time the same issue parks. */
export function alertKey(issue: BlockedIssue): string {
  return `${issue.identifier}@${new Date(issue.strandedSinceMs).toISOString()}`;
}

/**
 * Sort the blocked issues into the three things they can mean.
 *
 * An issue carrying an `unblockDescriptor` is waiting on a named owner for a
 * named thing. That is a person choosing to park work, which is the system
 * working. Alerting on it would bury the 99 cases where nobody chose anything.
 *
 * What decides it is who owns the recovery action, not whether one exists. A
 * descriptor alongside an **agent-owned** action is one wait described twice:
 * `deliberate_wait_without_target` is the platform noting the agent's own
 * declared wait, so LAC-3980 (waiting on Janet Harriman's reply) reported as an
 * escalation for a week while being perfectly healthy. A descriptor alongside a
 * **board-owned** action is not the same animal and must still be reported: on
 * LAC-4085 the descriptor said "when LAC-4177 resolves, re-record", LAC-4177
 * went `done` on 2026-10-15, and the issue stayed parked because `blocked`
 * wakes nobody when the named condition comes true. Descriptor-first would have
 * silenced exactly the case this check exists for.
 *
 * So the carve-out is an allowlist, not "anything but board". `owner_type` has
 * three live values, measured 2026-11-04: board (5295 rows), agent (1233) and
 * **system** (40). Only an agent-owned action is the agent restating its own
 * wait. A system-owned one is not: `provider_quota` is system-owned, and a
 * quota exhaustion that happened to carry a descriptor is still nobody having
 * been told. An unknown fourth value must escalate too, because the cost of
 * this check being wrong is asymmetric -- a spurious alert is a line Lacy
 * ignores, a missed one is the 9.5h blind window this script exists for.
 */
export function classify(
  issues: BlockedIssue[],
  nowMs: number,
  graceMinutes: number = GRACE_MINUTES
): Verdict {
  const verdict: Verdict = { escalated: [], orphaned: [], declared: [], young: 0 };
  const seen = new Set<string>();
  const cutoff = nowMs - graceMinutes * 60_000;

  for (const issue of issues) {
    // One active recovery action per issue is the platform's invariant, but a
    // join is a join: a duplicate row must not become a duplicate alert.
    if (seen.has(issue.identifier)) continue;
    seen.add(issue.identifier);

    if (issue.strandedSinceMs > cutoff) {
      verdict.young += 1;
      continue;
    }
    const restatesOwnWait = issue.recoveryOwner === "" || issue.recoveryOwner === "agent";
    if (issue.hasDescriptor && restatesOwnWait) verdict.declared.push(issue);
    else if (issue.recoveryCause) verdict.escalated.push(issue);
    else verdict.orphaned.push(issue);
  }
  return verdict;
}

/**
 * A wake that was saved and will never start (LAC-6995).
 *
 * The same failure as the `blocked` park above, moved into the wake table. A
 * wake that lands while an issue holds an execution lock is written as
 * `deferred_issue_execution` and the author is told "Your message is saved."
 * It is saved. Nothing starts it, and unlike the park there is no recovery
 * action, no status change and no card, so the issue reads healthy to every
 * check in this file and every sweep on the box.
 *
 * Measured on the control plane 2026-11-05 (server 2026.1023.0):
 *
 * 1. Promotion is **edge-triggered only**. `runReleaseDrain`
 *    (`modules/wake-queue/application/use-cases.js:72`) is reached from exactly
 *    one caller, `createReleaseIssueExecution` at :735, i.e. when a run on that
 *    issue releases its lock. There is no periodic promoter, so a hold that
 *    outlives every run on the issue strands every wake behind it for good.
 * 2. Six of the eight live cases are held by an `active_run_watchdog` recovery
 *    action whose status is **`resolved`**, carrying
 *    `evidence.automaticRecovery.replay = 'blocked'`.
 *    `executionBlockerPredicate()` matches that row through its explicit
 *    "resolved bookkeeping can still carry an effective no-replay hold"
 *    branch, so an already-settled row holds the issue permanently. 122 such
 *    rows on 77 issues, 39 of them non-terminal.
 * 3. Only a **human** comment can retire the hold:
 *    `admitExplicitNativeContinuation` requires `issueComments.authorType =
 *    'user'` and returns before calling `onBlocked` for anything else, which is
 *    why the saved receipt reads the generic default `execution_recovery`. An
 *    agent comment, an `issue_assigned`, an `issue_blockers_resolved` or a
 *    routine slot is saved and unstartable.
 * 4. The saved wake is itself why nothing escalates.
 *    `recovery/service.js:641 hasActiveExecutionPath` returns true when a
 *    deferred wake exists, and it gates `reconcileStrandedAssignedIssues` (4
 *    sites) and `reconcileResolvedDependencyWakeBackstop` (1). The platform's
 *    own backstops skip the issue *because* the message is waiting.
 * 5. The edge itself is not reliable either. LAC-2809 has had no execution
 *    blocker since 2026-10-17, a run on it released at 2026-11-05 10:05Z, and
 *    its 2026-11-03 17:37Z `issue_assigned` wake was still deferred 40.5h
 *    later. So "the hold cleared" is not sufficient; the drain has to run.
 *
 * Where the holds come from, same measurement: of the 122 `replay = 'blocked'`
 * rows, **105 trace to a run that was cancelled with error code `cancelled`**,
 * i.e. a Stop. Stopping a run leaves a permanent no-replay hold on its issue,
 * which is why they arrive in batches (23 issues deafened inside one minute on
 * 2026-11-03 12:44 local) and why review gates are the visible victim class:
 * all five of the held gates in the first live pass were `Code review:` or
 * `QA:` issues, whose only wake is the `backlog` -> `todo` flip or a comment.
 *
 * This lane reports and never writes, for a harder reason than the rest of the
 * file. The hold means "we could not verify the previous provider stopped".
 * Clearing it blind invites two providers on one workspace. The safe repair is
 * per case and belongs to a person: a human comment on the issue, or re-filing
 * the work on a fresh issue, which carries no hold because the hold is keyed to
 * `source_issue_id`.
 */
export interface DeferredWake {
  identifier: string;
  title: string;
  /** Who owns the issue. */
  assignee: string;
  /** Whose wake is sitting unstarted. Often not the assignee. */
  waiter: string;
  /** Saved wakes on this issue for this agent. 5 on LAC-6825 on 2026-11-05. */
  savedCount: number;
  /** The oldest saved wake, which is how long the strand has lasted. */
  oldestMs: number;
  /** The newest saved wake. A reply after this settles the whole strand. */
  newestMs: number;
  /** Latest comment the waiting agent posted on the issue, or 0 if none. */
  waiterSpokeMs: number;
  /** `executionWait.reason`, or "" when the wake was deferred behind a live run. */
  waitReason: string;
  /** `cause` of the recovery action still holding the issue, or "" if none. */
  holdCause: string;
}

export interface DeferredVerdict {
  /** Saved past the grace with nothing left that could start it. */
  stranded: DeferredWake[];
  /** Saved too recently to judge. */
  young: number;
  /** The waiting agent commented after the newest wake, so it got control anyway. */
  superseded: number;
}

/**
 * Distinct from `alertKey` by construction: a prefix, so a deferred strand and
 * a park on the same issue at the same millisecond cannot silence each other.
 * Keyed on the OLDEST saved wake, so the fifth message on an issue already
 * reported does not buy a second DM. The strand is the problem, not the count.
 */
export function deferredKey(wake: DeferredWake): string {
  return `deferred:${wake.identifier}:${wake.waiter}@${new Date(wake.oldestMs).toISOString()}`;
}

/**
 * The query has already excluded every issue with a live run, so a row here has
 * nothing in flight that could drain it. Grace is applied in TypeScript, like
 * the park lane, because a release drain in progress and a native finalization
 * mid-flight both settle in seconds and neither should be named.
 */
export function classifyDeferred(
  wakes: DeferredWake[],
  nowMs: number,
  graceMinutes: number = GRACE_MINUTES
): DeferredVerdict {
  const verdict: DeferredVerdict = { stranded: [], young: 0, superseded: 0 };
  const cutoff = nowMs - graceMinutes * 60_000;
  for (const wake of wakes) {
    // The waiter spoke on this issue after its newest saved wake: it got control
    // some other way (LAC-6939, 2 minutes after the wake deferred). Nothing was
    // lost and there is nothing to repair. The comment must come from a run
    // that STARTED after the newest wake (enforced in DEFERRED_QUERY): the run
    // that was live when the wake deferred never read the saved message, so its
    // closing comment is not evidence. This is evidence the agent ran, not
    // a guess that the strand looks settled; a hold or a missing hold says
    // nothing about it. A comment BEFORE the wake does not count.
    if (wake.waiterSpokeMs > wake.newestMs) {
      verdict.superseded += 1;
      continue;
    }
    // Age is the only reason to withhold one. A missing hold is NOT a reason:
    // promotion is edge-triggered on a run release, so a cleared hold starts
    // nothing by itself (LAC-2809 sat 40.5h with no hold and a release in
    // between). Filtering on the hold would have certified the worse half.
    if (wake.oldestMs > cutoff) verdict.young += 1;
    else verdict.stranded.push(wake);
  }
  verdict.stranded.sort((a, b) => a.oldestMs - b.oldestMs);
  return verdict;
}

export function describeDeferred(wake: DeferredWake, nowMs: number): string {
  // The hold is the actionable half: with one, a person has to clear it or
  // re-file; without one, the drain simply never ran and the strand is a bug
  // in promotion rather than a stuck lock.
  const why = wake.holdCause
    ? `held by ${wake.holdCause}`
    : wake.waitReason
      ? `${wake.waitReason}, hold already gone`
      : "deferred behind a run that never released";
  const saved = wake.savedCount === 1 ? "1 message" : `${wake.savedCount} messages`;
  return `${wake.identifier} (${wake.waiter || "unknown agent"}, ${formatAge(wake.oldestMs, nowMs)}, ${saved} saved, ${why}): ${wake.title}`;
}

/** Everything that needs an owner it does not have, newest park first. */
export function stranded(verdict: Verdict): BlockedIssue[] {
  return [...verdict.escalated, ...verdict.orphaned].sort(
    (a, b) => b.strandedSinceMs - a.strandedSinceMs
  );
}

/** Days, because "parked 71 days" lands differently than a date in July. */
export function formatAge(sinceMs: number, nowMs: number): string {
  const days = Math.floor((nowMs - sinceMs) / 86_400_000);
  if (days >= 1) return `${days}d`;
  const hours = (nowMs - sinceMs) / 3_600_000;
  return `${Number(hours.toFixed(1))}h`;
}

function describe(issue: BlockedIssue, nowMs: number): string {
  const why = issue.recoveryCause || "no wake path";
  return `${issue.identifier} (${issue.assignee || "unassigned"}, ${formatAge(issue.strandedSinceMs, nowMs)}, ${why}): ${issue.title}`;
}

/**
 * The first run is a different message from every run after it.
 *
 * Steady state, the news is "this one just went quiet." On the first run the
 * news is a backlog that has been accumulating for months, and naming 128 of
 * them is not a message anyone reads. So the baseline gets counted, not listed,
 * and says plainly that the listing starts now.
 */
export function formatAlert(
  verdict: Verdict,
  fresh: BlockedIssue[],
  nowMs: number,
  isBaseline: boolean
): string {
  const all = stranded(verdict);
  if (isBaseline) {
    return (
      `Fleet work is parked with nobody told: ${all.length} issues ` +
      `(${verdict.escalated.length} waiting on a board decision that was never sent, ` +
      `${verdict.orphaned.length} with no wake path at all). ` +
      "Recorded as the baseline. From here you get one line per new one."
    );
  }

  const head =
    fresh.length === 1
      ? "1 issue just went quiet with nobody told:"
      : `${fresh.length} issues just went quiet with nobody told:`;
  const named = fresh.slice(0, MAX_NAMED).map((issue) => describe(issue, nowMs));
  const rest = fresh.length > MAX_NAMED ? [`+${fresh.length - MAX_NAMED} more`] : [];
  return [head, ...named, ...rest, `Parked in total: ${all.length}.`].join("\n");
}

/**
 * The deferred half of the DM. A separate block rather than more lines in
 * `formatAlert`, because the two classes want different verbs: a park needs
 * someone to decide, a saved wake needs someone to clear a hold or re-file.
 * Merging them would produce a list where no single action applies.
 */
export function formatDeferredAlert(
  verdict: DeferredVerdict,
  fresh: DeferredWake[],
  nowMs: number,
  isBaseline: boolean
): string {
  const total = verdict.stranded.length;
  if (isBaseline) {
    const held = verdict.stranded.filter((w) => w.holdCause).length;
    return (
      `Agent messages saved and never started: ${total} ` +
      `(${held} behind an execution hold, ${total - held} behind a run that never released). ` +
      "Recorded as the baseline. From here you get one line per new one."
    );
  }
  const head =
    fresh.length === 1
      ? "1 agent message was saved and will never start:"
      : `${fresh.length} agent messages were saved and will never start:`;
  const named = fresh.slice(0, MAX_NAMED).map((wake) => describeDeferred(wake, nowMs));
  const rest = fresh.length > MAX_NAMED ? [`+${fresh.length - MAX_NAMED} more`] : [];
  return [head, ...named, ...rest, `Saved and unstarted in total: ${total}.`].join("\n");
}

/** Only ever the parks this state file has not already reported. */
export function unreported(current: BlockedIssue[], seenKeys: string[]): BlockedIssue[] {
  const seen = new Set(seenKeys);
  return current.filter((issue) => !seen.has(alertKey(issue)));
}

/** Same contract as `unreported`, against the prefixed deferred keys. */
export function unreportedDeferred(current: DeferredWake[], seenKeys: string[]): DeferredWake[] {
  const seen = new Set(seenKeys);
  return current.filter((wake) => !seen.has(deferredKey(wake)));
}

/** The deferred strands still live, for the shared state file. */
export function nextDeferredState(current: DeferredWake[]): string[] {
  return current.map(deferredKey).sort();
}

/**
 * Keys still parked, so the file stays the size of the problem. A key dropped
 * because its issue recovered cannot cause a repeat alert: the next park of
 * that issue carries a later timestamp and therefore a different key.
 */
export function nextState(current: BlockedIssue[]): string[] {
  return current.map(alertKey).sort();
}

const QUERY = `
  SELECT i.identifier,
         i.title,
         coalesce(a.name, '') AS assignee,
         (extract(epoch FROM coalesce(i.blocked_transition_at, i.updated_at)) * 1000)::bigint AS stranded_since_ms,
         coalesce(ra.cause, '') AS recovery_cause,
         coalesce(ra.owner_type, '') AS recovery_owner,
         (i.unblock_descriptor IS NOT NULL) AS has_descriptor
    FROM issues i
    LEFT JOIN agents a ON a.id = i.assignee_agent_id
    LEFT JOIN issue_recovery_actions ra
           ON ra.source_issue_id = i.id AND ra.status = 'active'
   WHERE i.status = 'blocked'
     AND i.company_id <> $1
     AND NOT EXISTS (
           SELECT 1
             FROM issue_relations ir
             JOIN issues b ON b.id = ir.issue_id
            WHERE ir.related_issue_id = i.id
              AND ir.type = 'blocks'
              AND b.status NOT IN ('done', 'cancelled')
         )
`;

/**
 * Saved wakes with nothing left that could start them, grouped by issue and
 * waiting agent so five saved messages read as one strand.
 *
 * Three deliberate choices:
 *
 * - `i.id::text = w.payload ->> 'issueId'` and not a `::uuid` cast. One
 *   malformed payload would otherwise throw and take the whole check down,
 *   which is the failure mode this file exists to prevent.
 * - The live-run set is `running`/`queued`/`scheduled_retry`, copied from the
 *   server's own "is execution active" test in
 *   `explicit-native-continuation.js`. A wake behind one of those is healthy:
 *   that run's release will drain it.
 * - The hold lateral is not filtered by cause. The six known causes all sit in
 *   `EXECUTION_RECONCILIATION_CAUSES`, but naming them here would make this
 *   query lie the first time the server adds a seventh, and the point of the
 *   column is to tell a reader whether a hold is present at all.
 * - It prefers a live hold over a resolved-but-replay-blocked one. The WHERE
 *   admits both shapes, so on an issue carrying one of each a plain
 *   `updated_at DESC` can name the resolved row and make a live hold read as
 *   cleared. No issue on the board has two distinct causes today (measured
 *   2026-11-05, LAC-7013 Q3), so this is a correctness guard rather than a
 *   bug fix, and it is why the sort key is the status predicate first.
 */
const DEFERRED_QUERY = `
  SELECT i.identifier,
         i.title,
         coalesce(ia.name, '') AS assignee,
         coalesce(wa.name, '') AS waiter,
         count(*)::bigint AS saved_count,
         (extract(epoch FROM min(w.requested_at)) * 1000)::bigint AS oldest_ms,
         (extract(epoch FROM max(w.requested_at)) * 1000)::bigint AS newest_ms,
         coalesce((extract(epoch FROM (array_agg(sp.last_at ORDER BY w.requested_at DESC))[1]) * 1000)::bigint, 0) AS waiter_spoke_ms,
         coalesce(max(w.payload -> 'executionWait' ->> 'reason'), '') AS wait_reason,
         coalesce(max(h.cause), '') AS hold_cause
    FROM agent_wakeup_requests w
    JOIN issues i ON i.id::text = w.payload ->> 'issueId'
    LEFT JOIN agents ia ON ia.id = i.assignee_agent_id
    LEFT JOIN agents wa ON wa.id = w.agent_id
    LEFT JOIN LATERAL (
           SELECT max(c.created_at) AS last_at
             FROM issue_comments c
             JOIN heartbeat_runs cr ON cr.id = c.created_by_run_id
            WHERE c.issue_id = i.id
              AND c.author_agent_id = w.agent_id
              AND cr.started_at > w.requested_at
         ) sp ON true
    LEFT JOIN LATERAL (
           SELECT ra.cause
             FROM issue_recovery_actions ra
            WHERE ra.source_issue_id = i.id
              AND (ra.status IN ('active', 'escalated')
                   OR ra.evidence -> 'automaticRecovery' ->> 'replay' = 'blocked')
            ORDER BY (ra.status IN ('active', 'escalated')) DESC,
                     ra.updated_at DESC
            LIMIT 1
         ) h ON true
   WHERE w.status = 'deferred_issue_execution'
     AND i.company_id <> $1
     AND i.status NOT IN ('done', 'cancelled')
     AND NOT EXISTS (
           SELECT 1
             FROM heartbeat_runs r
            WHERE r.company_id = i.company_id
              AND coalesce(r.native_issue_id::text, r.context_snapshot ->> 'issueId') = i.id::text
              AND r.status IN ('running', 'queued', 'scheduled_retry')
         )
   GROUP BY i.identifier, i.title, ia.name, wa.name
`;

/**
 * Read the board straight from Postgres. The URL is required rather than
 * defaulted so this file holds no credential, and so a typo fails loudly
 * instead of quietly watching the wrong database.
 */
async function readBoard(
  url: string
): Promise<{ blocked: BlockedIssue[]; deferred: DeferredWake[] }> {
  // Timeouts, because a wedged database must not wedge the thing watching for
  // wedges. launchd would otherwise keep one hung process and skip every cycle.
  const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5 });
  try {
    type Row = Record<string, unknown>;
    // One connection, two queries, both read-only. A failure in either must
    // fail the whole check (exit 2) rather than report half a board as healthy.
    const blockedRows = (await sql.unsafe(QUERY, [GHOST_COMPANY_ID])) as unknown as Row[];
    const deferredRows = (await sql.unsafe(DEFERRED_QUERY, [GHOST_COMPANY_ID])) as unknown as Row[];
    return {
      blocked: blockedRows.map((row) => ({
        identifier: String(row.identifier),
        title: String(row.title),
        assignee: String(row.assignee ?? ""),
        strandedSinceMs: Number(row.stranded_since_ms),
        recoveryCause: String(row.recovery_cause ?? ""),
        recoveryOwner: String(row.recovery_owner ?? ""),
        hasDescriptor: row.has_descriptor === true,
      })),
      deferred: deferredRows.map((row) => ({
        identifier: String(row.identifier),
        title: String(row.title),
        assignee: String(row.assignee ?? ""),
        waiter: String(row.waiter ?? ""),
        savedCount: Number(row.saved_count),
        oldestMs: Number(row.oldest_ms),
        newestMs: Number(row.newest_ms),
        waiterSpokeMs: Number(row.waiter_spoke_ms ?? 0),
        waitReason: String(row.wait_reason ?? ""),
        holdCause: String(row.hold_cause ?? ""),
      })),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readSeenKeys(statePath: string): Promise<string[] | null> {
  const raw = await readFile(statePath, "utf8").catch(() => null);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { keys?: unknown };
    return Array.isArray(parsed.keys) ? parsed.keys.map(String) : [];
  } catch {
    // A truncated state file must not mean "everything is new" and 128 DMs.
    // Treat it as a fresh baseline: one line, and the file is rewritten whole.
    return null;
  }
}

async function writeSeenKeys(statePath: string, keys: string[]): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({ keys }, null, 2)}\n`);
}

/**
 * Slack-DM the line. Same contract as the freshness check: return the error
 * instead of throwing, because a failed DM must still leave the lines in the
 * launchd log and the exit code at 1. A monitor that goes quiet because its own
 * notifier broke is the bug this file exists to prevent.
 */
async function slackDm(text: string): Promise<string | null> {
  const token = process.env.STRANDED_WATCH_SLACK_TOKEN;
  const channel = process.env.STRANDED_WATCH_SLACK_CHANNEL;
  if (!token || !channel) {
    return "STRANDED_WATCH_SLACK_TOKEN and STRANDED_WATCH_SLACK_CHANNEL must both be set to notify";
  }
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, text }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    return body.ok ? null : `Slack rejected the message: ${body.error ?? res.status}`;
  } catch (error) {
    return `Slack post failed: ${(error as Error).message}`;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const statePath = (() => {
    const i = argv.indexOf("--state");
    const stateArg = i >= 0 ? argv[i + 1] : undefined;
    return stateArg ? path.resolve(stateArg) : DEFAULT_STATE_PATH;
  })();

  const url = process.env.PAPERCLIP_DB_URL;
  if (!url) {
    console.error("PAPERCLIP_DB_URL must be set (postgres://... for the Paperclip control plane)");
    process.exit(2);
  }

  let issues: BlockedIssue[];
  let deferredWakes: DeferredWake[];
  try {
    const board = await readBoard(url);
    issues = board.blocked;
    deferredWakes = board.deferred;
  } catch (error) {
    // Exit 2, not 1. "Could not look" must never be logged as "nothing is
    // parked", and it must not consume the one alert a real park would get.
    console.error(`could not read the Paperclip database: ${(error as Error).message}`);
    process.exit(2);
  }

  const now = Date.now();
  const verdict = classify(issues, now);
  const current = stranded(verdict);
  const deferredVerdict = classifyDeferred(deferredWakes, now);
  const currentDeferred = deferredVerdict.stranded;
  const seenKeys = await readSeenKeys(statePath);
  const isBaseline = seenKeys === null;

  if (current.length === 0 && currentDeferred.length === 0) {
    // Healthy is silent. Record the empty set so a later park reads as new.
    if (!isBaseline) await writeSeenKeys(statePath, []);
    process.exit(0);
  }

  const fresh = isBaseline ? current : unreported(current, seenKeys);
  const freshDeferred = isBaseline
    ? currentDeferred
    : unreportedDeferred(currentDeferred, seenKeys);

  for (const issue of current) console.log(describe(issue, now));
  console.log(
    `parked: ${current.length} (escalated ${verdict.escalated.length}, orphaned ${verdict.orphaned.length}), ` +
      `declared waits ignored: ${verdict.declared.length}, too recent to judge: ${verdict.young}, new: ${fresh.length}`
  );
  for (const wake of currentDeferred) console.log(describeDeferred(wake, now));
  console.log(
    `saved and unstarted: ${currentDeferred.length}, too recent to judge: ${deferredVerdict.young}, ` +
      `new: ${freshDeferred.length}`
  );

  // One DM for both lanes. Two notifiers on one launchd tick would mean two
  // Slack calls, two failure modes and two chances for one lane's outage to
  // consume the other lane's alert.
  const blocks = [
    ...(current.length > 0 && (isBaseline || fresh.length > 0)
      ? [formatAlert(verdict, fresh, now, isBaseline)]
      : []),
    ...(currentDeferred.length > 0 && (isBaseline || freshDeferred.length > 0)
      ? [formatDeferredAlert(deferredVerdict, freshDeferred, now, isBaseline)]
      : []),
  ];

  if (argv.includes("--notify") && blocks.length > 0) {
    const failure = await slackDm(blocks.join("\n\n"));
    if (failure) console.error(failure);
    // Written only on a delivered DM, so a Slack outage retries next cycle
    // instead of silently consuming the alert this park was going to get.
    // Both lanes are written together: the DM carried both, so a partial
    // write would re-report whichever lane was left out.
    else
      await writeSeenKeys(statePath, [
        ...nextState(current),
        ...nextDeferredState(currentDeferred),
      ]);
  }

  process.exit(1);
}

// Guarded so the pure helpers above can be imported by tests without touching
// Postgres, the filesystem or Slack.
if (import.meta.main) {
  main().catch((error) => {
    console.error("stranded watch failed:", error);
    process.exit(2);
  });
}
