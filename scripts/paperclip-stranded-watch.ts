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

import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
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

/**
 * Exit codes. 1 is a report (something is parked); 2 means the watch could not
 * look. They must stay distinct: a caller that treats 2 like 0 reads a blind
 * watch as a healthy board, which is how LAC-6096 sat parked six days (LAC-6580).
 */
export const EXIT_QUIET = 0;
export const EXIT_PARKED = 1;
export const EXIT_COULD_NOT_LOOK = 2;

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
  /**
   * `cause` of the execution hold still on the issue, or "" if none.
   *
   * Distinct from `recoveryCause`, which is the ACTIVE recovery action and
   * is "" on all 37 held issues measured 2026-11-12: the hold these carry
   * lives in a RESOLVED row whose evidence says `replay = 'blocked'`. The
   * two columns answer different questions and an issue can have either,
   * both, or neither.
   *
   * Since LAC-8030 this is the MERGED hold: `execution_owner_active` when the
   * ownership arm holds, the recovery action's cause otherwise, in the server's
   * own precedence. See `mergeHold`.
   */
  holdCause: string;
  /**
   * Which ownership arm held and what to check before clearing it. "" for a
   * recovery-action hold, whose repair is a board resolve and needs no note.
   */
  holdNote: string;
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
 *    routine slot is saved and unstartable. Two more joined that list on
 *    2026-11-05 (LAC-7022), both measured rather than read: a `todo` ->
 *    `backlog` -> `todo` status flip, which on LAC-6825 and LAC-6924 at
 *    14:51:37Z wrote one fresh `execution_reconciliation_required` / `skipped`
 *    / runId-null row and left all 5 and all 2 saved wakes exactly where they
 *    were (LAC-6924 then re-deferred an agent comment 30 minutes later, so the
 *    hold outlived the flip by a measured margin); and an assignee change,
 *    which on LAC-6976 produced a fresh `deferred_issue_execution` row at
 *    15:57:29Z. The flip matters most, because it is the repair the
 *    ORPHANWAKE rung in `paperclip-company/scripts/gateless-sweep.py`
 *    prescribes -- that rung now recounts the saved rows instead of trusting
 *    the fresh one, and hands a surviving hold here.
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
 * Asked and answered 2026-11-05 (LAC-7022, question 5): should the lane also
 * report a strand that LEFT `deferred_issue_execution` for `cancelled` or
 * `skipped` without ever running, rather than going quiet? No. The platform's
 * own suppression is an existence query over that status
 * (`recovery/service.js:651`, LIMIT 1, no ordering), so the moment the row
 * leaves it `reconcileStrandedAssignedIssues` is un-muted and the board's own
 * backstop covers the ISSUE again. The MESSAGE is still lost, and this lane
 * could not recover it anyway -- there is no re-send. Holding a cursor over
 * finished wakes would buy a line of history at the cost of a second state
 * file, so the complication loses. What that leaves unanswered is whether the
 * discard was reasonable, which is a question about the wake queue, not about
 * strands.
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
  /** `executionWait.reason`, or "" when the wake was deferred behind a live run. */
  waitReason: string;
  /**
   * What the server would report as the execution blocker, or "" if nothing
   * holds: the `cause` of a recovery action, or `execution_owner_active` when
   * the ownership arm holds first. See `ownershipHold` for why both.
   */
  holdCause: string;
  /** Which ownership arm held and what to clear. "" for a recovery action. */
  holdNote: string;
}

export interface DeferredVerdict {
  /** Saved past the grace with nothing left that could start it. */
  stranded: DeferredWake[];
  /** Saved too recently to judge. */
  young: number;
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
  const verdict: DeferredVerdict = { stranded: [], young: 0 };
  const cutoff = nowMs - graceMinutes * 60_000;
  for (const wake of wakes) {
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
    ? `held by ${wake.holdCause}${wake.holdNote ? ` (${wake.holdNote})` : ""}`
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
  // Hold first, and ahead of `recoveryCause`, because it changes WHO can act.
  // A park with no hold is repaired by whoever owns the issue flipping its
  // status. A park with one is not repairable that way at all -- the watchdog
  // re-parks the flip in ~40s and writes another blocked-replay row -- and the
  // route that does repair it answers 403 to every agent key. Printing the
  // same "no wake path" for both sends the reader down the path that cannot
  // work and makes the row harder to fix on the way (LAC-7846).
  //
  // The two kinds of hold want different hands, which is why they are worded
  // apart (LAC-8030). A recovery-action hold is retired by a board resolve and
  // nothing else. An ownership hold has no action row TO resolve: the server
  // holds because a process, process group or lease from the previous run was
  // never confirmed dead, so the note says which arm held and what to check.
  // Telling a reader to "board resolve" a hold with no action row is an
  // instruction that cannot be carried out.
  const why = issue.holdCause
    ? `held by ${issue.holdCause}${
        issue.holdNote ? ` (${issue.holdNote})` : ", board resolve only"
      }`
    : issue.recoveryCause || "no wake path";
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

/**
 * The watch could not look. Said out loud, because a monitor that fails into a
 * log nobody reads looks exactly like a healthy board.
 */
export function formatBlindAlert(reason: string): string {
  return `Stranded-work watch could not look, so nothing parked is being reported: ${reason}`;
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

/** What commit this script is actually running from. See `formatDeployAlert`. */
export interface DeployState {
  /** `git rev-parse HEAD` in the script's own checkout, null when git failed. */
  head: string | null;
  /** `git rev-parse origin/main`, null when git failed or the ref is missing. */
  originMain: string | null;
  branch: string | null;
  /**
   * mtime of the checkout's `FETCH_HEAD` in ms: when this copy last reached
   * GitHub. Null when no fetch has ever landed in it, or git could not say
   * where the file lives. See `formatFetchAlert` for why it is read at all.
   */
  lastFetchMs: number | null;
}

export const DEPLOY_KEY_PREFIX = "deploy-stale:";

/**
 * One key per (running commit, origin/main) pair, so a stale deploy is reported
 * once rather than every day until someone notices. A new commit on either side
 * is a different situation and gets its own line.
 */
export function deployKey(state: DeployState): string {
  return `${DEPLOY_KEY_PREFIX}${state.head ?? "unknown"}:${state.originMain ?? "unknown"}`;
}

/**
 * A report produced by a copy that is not `origin/main` is not a report about
 * the fleet, it is a report about an old script, and until 2026-11-05 nothing
 * said so. The sweep ran this check from `~/repo/buildandserve`, a shared
 * checkout other sessions work in, which was sitting on branch
 * `LAC-5692/brand-implementation` with a copy dated 2026-10-17. Both of
 * LAC-4568's own merged fixes -- PR #58 (the `owner_type` allowlist) and PR #108
 * (the deferred-wake lane) -- were on main and had never run, and the daily DM
 * kept arriving, produced by pre-#58 logic. A wrong report is worse than no
 * report, because it is trusted.
 *
 * The invocation pulls `--ff-only` before each run, so `origin/main` is normally
 * fresh when this is read. When that pull fails -- run by hand without one, or a
 * host that cannot reach GitHub -- a stale `origin/main` can read as a match,
 * which is a false negative and never a false positive. `formatFetchAlert` below
 * covers that case by reading how old the last successful fetch is, so the
 * silence here is no longer the only evidence.
 *
 * Returns null when the running copy IS `origin/main`, which is the normal case.
 */
export function formatDeployAlert(state: DeployState): string | null {
  if (state.head === null || state.originMain === null) {
    return (
      "The stranded watch cannot tell which commit it is running: `git rev-parse` " +
      "failed in its own checkout. Treat the rest of this report as unverified."
    );
  }
  if (state.head === state.originMain) return null;
  return (
    `The stranded watch is running ${state.head.slice(0, 8)} on branch ` +
    `${state.branch ?? "unknown"}, not origin/main (${state.originMain.slice(0, 8)}). ` +
    "Everything below was produced by that copy, so a fix merged to main may not be in it."
  );
}

/**
 * A fetch older than this says the refresh is failing, not that it was skipped
 * once.
 *
 * The sweep runs this check once a day, so a single failed pull puts the last
 * successful fetch ~24h back and the next run's pull normally clears it. 36h is
 * past that one blip and short of two consecutive failures (~48h), which is the
 * shape worth saying out loud: the host has lost DNS for a stretch and
 * `origin/main` has stopped moving. Lower and a slow network blip alarms;
 * higher and two blind days pass unsaid.
 */
export const FETCH_STALE_HOURS = 36;

export const FETCH_KEY_PREFIX = "fetch-stale:";

/**
 * One key per last-successful-fetch timestamp, same contract as `deployKey`: a
 * refresh that is still failing tomorrow is the same situation, not new news,
 * and it stays on stdout and in the launchd log either way. A pull that lands
 * moves the mtime, which both clears the condition and retires the key.
 */
export function fetchKey(state: DeployState): string {
  return `${FETCH_KEY_PREFIX}${state.lastFetchMs === null ? "never" : new Date(state.lastFetchMs).toISOString()}`;
}

/** Whole hours, because "1d" would cover anything from 24h to 47h here. */
function formatFetchAge(sinceMs: number, nowMs: number): string {
  return `${Math.floor((nowMs - sinceMs) / 3_600_000)}h`;
}

/**
 * `formatDeployAlert` trusts the invocation's `git pull --ff-only` for a fresh
 * `origin/main`, and the sweep swallows that pull's failure (`|| true`). On a
 * host that cannot reach GitHub -- this Mac has gone fully DNS-blind twice in
 * one day, which breaks git and leaves everything else looking healthy --
 * `origin/main` stays where it was, `HEAD` matches it, and the deploy check says
 * nothing. A false negative, silently, in the one check whose whole job is to
 * say whether the rest of the report can be trusted (LAC-7050 nit 3).
 *
 * So the age of the last successful fetch is read directly instead of being
 * inferred from the comparison. Returns null when the fetch is fresh, which is
 * the normal case, including when `HEAD` and `origin/main` match.
 */
export function formatFetchAlert(state: DeployState, nowMs: number): string | null {
  if (state.lastFetchMs === null) {
    return (
      "The stranded watch could not refresh origin/main (no successful fetch on " +
      "record in its checkout), so the commit check below is comparing against a " +
      "ref that may never have been updated."
    );
  }
  if (nowMs - state.lastFetchMs < FETCH_STALE_HOURS * 3_600_000) return null;
  return (
    "The stranded watch could not refresh origin/main (last fetch " +
    `${formatFetchAge(state.lastFetchMs, nowMs)} ago), so the commit check below ` +
    "can read as a match against a stale ref. Check this host's network before " +
    "trusting the rest of this report."
  );
}

/**
 * `EXECUTION_RECONCILIATION_CAUSES`, pinned, from `@paperclipai/shared`
 * `dist/types/execution-projection.js`. The hold lateral below needs it in SQL
 * and this script is standalone (`bun scripts/...`, no dependency on the
 * server package), so the alternative to pinning is hardcoding an
 * `~/.npm/_npx/<hash>/` path that changes on every server upgrade.
 *
 * Pinning trades a loud false positive for a quiet missing row: a cause the
 * server adds becomes a hold this column fails to report. That trade is only
 * acceptable because the drift is TESTED --
 * `tests/node/ops/paperclip-stranded-watch.test.ts` resolves the installed
 * package and asserts list equality, skipping loudly when it cannot find it.
 * Without that test the pin is worse than the omission it replaced.
 *
 * A counter of recovery actions whose cause falls OUTSIDE this list was
 * considered as the drift signal instead and rejected on measurement: at
 * 17:10Z on 2026-11-05 that counter read 49, all of it ordinary board
 * bookkeeping (`stranded_assigned_issue` 32, `deliberate_wait_without_target`
 * 11, and so on). A signal that is permanently non-zero cannot announce an
 * eighteenth cause; it would have to be pinned against a second list with the
 * same drift problem. The test can tell those two apart and the counter cannot.
 */
export const EXECUTION_RECONCILIATION_CAUSES = [
  "uncertain_provider_action",
  "uncertain_external_action",
  "uncertain_control_plane_action",
  "completed_action_context_missing",
  "continuation_evidence_incomplete",
  "execution_finalization_deadline_exceeded",
  "execution_recovery_budget_exhausted",
  "provider_effect_inventory_unavailable",
  "provider_failure_meaning_unverified",
  "provider_ownership_unverified",
  "native_provider_terminal_failed",
  "native_event_replay_conflict",
  "native_session_cleanup_quarantined",
  "native_session_retry_exhausted",
  "native_restart_recovery_blocked",
  "native_continuation_requires_reconciliation",
  "legacy_execution_requires_reconciliation",
] as const;

/**
 * `CONVERSATION_ADAPTER_TYPES`, pinned, from the server's
 * `dist/services/conversation-continuation.js`. Same trade and the same drift
 * test as the causes above. It is needed because
 * `conversationRecoveryActionPredicate()` is replicated in the hold lateral,
 * and that predicate is built on `conversationRunPredicate()`, which is built
 * on this list.
 */
export const CONVERSATION_ADAPTER_TYPES = [
  "claude_local",
  "codex_local",
  "cursor",
  "gemini_local",
  "opencode_local",
  "pi_local",
  "grok_local",
  "kimi_local",
  "hermes_local",
] as const;

/**
 * Both lists are interpolated into SQL rather than bound as parameters, because
 * they are fixed-length literal sets and the query is built once at module
 * load. They are source literals, never input, and the drift test asserts every
 * entry matches `/^[a-z_]+$/`, so the interpolation cannot carry a quote.
 */
const sqlList = (values: readonly string[], separator: string): string =>
  values.map((value) => `'${value}'`).join(separator);

const CAUSES_SQL = sqlList(EXECUTION_RECONCILIATION_CAUSES, ",\n                    ");
const ADAPTERS_SQL = sqlList(CONVERSATION_ADAPTER_TYPES, ", ");

/**
 * The execution hold, as one SQL fragment used by BOTH lanes.
 *
 * This is `executionBlockerPredicate()` from the server's
 * `services/execution-blocker.js`, replicated. The long comment on
 * `DEFERRED_QUERY` below is the record of what each conjunct is for, which
 * two are deliberately not replicated, and the measurements behind both
 * decisions; read it before changing a line here.
 *
 * It is a shared constant rather than two copies because LAC-7846 added the
 * second caller, and the whole value of the column is that it says exactly
 * what the server says. Two copies drift and the drift is silent.
 *
 * Both lanes alias it `h`, so both select `h.cause`.
 */
const HOLD_LATERAL = `    LEFT JOIN LATERAL (
           SELECT ra.cause
             FROM issue_recovery_actions ra
            WHERE ra.source_issue_id = i.id
              AND ra.cause IN (
                    ${CAUSES_SQL}
                  )
              AND (ra.status IN ('active', 'escalated')
                   OR ra.evidence -> 'automaticRecovery' ->> 'replay' = 'blocked')
              AND NOT (
                    ra.cause = 'legacy_execution_requires_reconciliation'
                AND EXISTS (
                      SELECT 1
                        FROM heartbeat_runs r
                       WHERE r.company_id = ra.company_id
                         AND r.id::text = ra.evidence ->> 'runId'
                         AND coalesce(r.native_issue_id::text,
                                      r.context_snapshot ->> 'issueId')
                             = ra.source_issue_id::text
                         AND r.runtime_mode = 'legacy'
                         AND r.status IN ('failed', 'timed_out', 'interrupted', 'cancelled')
                         AND coalesce(r.result_json ->> 'workspaceRestoreFailure', '')
                             <> 'restore_unsafe_archive'
                         AND coalesce(r.result_json -> 'workspaceRestoreRecovery' ->> 'schema', '')
                             <> 'paperclip.workspace-restore-recovery.v1'
                         AND (r.runner_profile_json -> 'adapterDispatch' ->> 'adapterType'
                                IN (${ADAPTERS_SQL})
                              OR r.result_json ->> 'conversationContinuation'
                                 = 'continue_conversation_v1'
                              OR EXISTS (
                                   SELECT 1
                                     FROM heartbeat_run_events e
                                    WHERE e.company_id = r.company_id
                                      AND e.run_id = r.id
                                      AND e.event_type = 'adapter.invoke'
                                      AND e.payload ->> 'adapterType'
                                          IN (${ADAPTERS_SQL})
                                 ))
                         AND (r.result_json ->> 'conversationContinuation'
                                = 'continue_conversation_v1'
                              OR r.status = 'interrupted'
                              OR r.error_code IN ('process_lost',
                                                  'server_shutdown_interrupted',
                                                  'execution_reconciliation_required')
                              OR (r.status = 'cancelled'
                                  AND r.result_json -> 'executionCancellation' ->> 'state'
                                      = 'acknowledged'))
                    )
                  )
            ORDER BY ra.updated_at DESC, ra.id DESC
            LIMIT 1
         ) h ON true`;

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
 * - The hold lateral IS filtered by cause, since LAC-7022. It was not until
 *   then, on the reasoning that naming the causes "would make this query lie
 *   the first time the server adds a seventh". That reasoning had it backwards:
 *   omitting the filter does not degrade gracefully, it reports holds that are
 *   not holds. `executionBlockerPredicate()` (`services/execution-blocker.js:12`)
 *   is `cause IN EXECUTION_RECONCILIATION_CAUSES` AND (`active`/`escalated` OR
 *   `replay = 'blocked'`), so the status half alone admits every other kind of
 *   recovery action. Measured twice on the live board 2026-11-05, at 16:45Z and
 *   again at 17:10Z before committing: 89 then 85 non-terminal issues matched
 *   the unfiltered lateral, and the named cause was outside the 17-cause set on
 *   55 then 49 of them. A 58-62% false-hold rate on the one column whose job is
 *   to say whether a hold is present; the drift between the two reads is the
 *   board moving, not the rate. The false causes are ordinary board
 *   bookkeeping, nothing to do with execution: `stranded_assigned_issue` (32
 *   issues), `deliberate_wait_without_target` (11), `issue_review_path_lost`
 *   (3), `execution_review_participant_recovery` (2),
 *   `workspace_validation_failed` (1). The list is pinned here with the server
 *   constant named, so a seventeenth-plus cause shows up as a missing row
 *   rather than as a silent false positive.
 *   Scope the claim honestly: that rate is over all non-terminal issues, which
 *   is the population strands are drawn FROM, not the lane's output on any one
 *   run. On the 17:10Z run the lane reported a single row (LAC-6939) and it
 *   carries no recovery action at all, so the filter changed nothing visible
 *   today. This is a correctness guard against the next strand that happens to
 *   also be carrying board bookkeeping, not a fix for a wrong line someone
 *   read.
 * - It DOES replicate the predicate's `NOT conversationRecoveryActionPredicate()`
 *   conjunct, since the review of LAC-7022. The first version of this filter
 *   skipped it and defended the skip by claiming those rows are held anyway
 *   because `getConversationOwnershipBlocker` returns non-null for them. That
 *   claim was wrong. The reviewer attacked it and was right to, then produced
 *   the opposite error -- "the column reports ~35 false holds" -- and both
 *   mistakes came from the same place: a PARTIAL replication of the exists
 *   clause (run matches the issue, `legacy`, terminal status) which is far more
 *   permissive than the real one. Author and reviewer each read the partial
 *   number as the real one, in opposite directions. Measured on the live board
 *   2026-11-05 18:0xZ, with every conjunct in place:
 *
 *   - Board-wide, 122 recovery-action rows across 77 issues pass the cause and
 *     status halves. The real predicate excludes **0** of them, and **0**
 *     issues change their hold column. On non-terminal issues alone the
 *     candidate set is 68 rows / 34 issues, also 0 excluded.
 *   - The reason is structural, not luck. The predicate matches 6070 rows
 *     board-wide -- it fires constantly -- and every single one is `resolved`
 *     (6068) or `cancelled` (2). None is `active`, none is `escalated`, none
 *     carries `replay = 'blocked'`. The run evidence that satisfies the
 *     predicate is the same evidence the recovery path uses to RETIRE the
 *     action, so the two populations are disjoint by construction.
 *   - "Disjoint by construction" is not "provably disjoint": an action could
 *     sit `active` in the window before reconciliation catches up, and in that
 *     window the unreplicated column names a hold the server would not. That
 *     window is why the conjunct is replicated even at a measured 0-row
 *     difference. The column is now the predicate, so nobody has to re-measure
 *     the divergence by reading two files and guessing which way it cuts.
 *   - The ownership leg of the old claim is simply false, and worth recording
 *     because it will be tempting again. `getConversationOwnershipBlocker`
 *     (`conversation-continuation.js:83-129`) returns null unless a PID is
 *     alive, a process group is alive, a lease is held, or a retained remote
 *     workspace has not confirmed it stopped. Returning early is not the same
 *     as returning a blocker. Probed all 931 ownership-candidate runs on 310
 *     non-terminal issues: 6 have a live PID, and all 6 are PID recycling
 *     (`locationd`, WebKit, Chrome, `feedbackd`), which the server rejects by
 *     comparing `process_started_at`. That rejection is sound, not an
 *     artifact: see "The start-time comparison works" below.
 *   - **"So there are 0 ownership holds on the board" followed, and it was
 *     wrong.** That probe covered the PID arm only. The server holds on a live
 *     process GROUP too and applies no recycled-id check to one, so the 4
 *     holds LAC-7073 went on to measure were invisible to it. Corrected in
 *     `ownershipHold` below, which carries the numbers and the independent
 *     host verification. Recorded rather than deleted, because the mistake is
 *     the instructive part: a probe of one arm got written up as a result
 *     about the whole predicate -- in a paragraph whose own subject is two
 *     people making that exact error in opposite directions.
 * - The ownership arm IS replicated as of LAC-7073, in `ownershipHold`, which
 *   is why this column no longer reads "no hold" on an issue the server holds
 *   with no recovery action at all. One conjunct is still not replicated,
 *   named here so the next reader does not have to rediscover it:
 *   - `getExecutionBlocker`'s conversation-boundary conjunct, which drops
 *     actions created before an issue's `conversation_boundary_comment_id`.
 *     Measured: 0 non-terminal issues on either company have a conversation
 *     boundary set, so the branch is unreachable for agent issues and only
 *     applies to chat-bound ones.
 * - Ordering mirrors the server exactly: `updated_at DESC, id DESC`
 *   (`execution-blocker.js:34`). A status-first key shipped in 4a5a9a23 and is
 *   reverted here. Its premise was that a `resolved` row is stale, but the
 *   whole reason the WHERE admits `resolved` is the branch documented two
 *   paragraphs up: resolved bookkeeping carrying `replay = 'blocked'` is a LIVE
 *   hold, and the server does not rank it below an `active` one. Preferring
 *   `active` also promoted exactly the over-admitted class the cause filter
 *   just removed. It changed the named cause on 0 of 85 issues either way (0 of
 *   89 on the earlier read), so nothing on the board moves; the `id DESC`
 *   tie-break is new and makes the row choice deterministic where two share
 *   an `updated_at`.
 */
const DEFERRED_QUERY = `
  SELECT i.identifier,
         i.title,
         coalesce(ia.name, '') AS assignee,
         coalesce(wa.name, '') AS waiter,
         count(*)::bigint AS saved_count,
         (extract(epoch FROM min(w.requested_at)) * 1000)::bigint AS oldest_ms,
         coalesce(max(w.payload -> 'executionWait' ->> 'reason'), '') AS wait_reason,
         coalesce(max(h.cause), '') AS hold_cause
    FROM agent_wakeup_requests w
    JOIN issues i ON i.id::text = w.payload ->> 'issueId'
    LEFT JOIN agents ia ON ia.id = i.assignee_agent_id
    LEFT JOIN agents wa ON wa.id = w.agent_id
${HOLD_LATERAL}
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
 * The OTHER half of `getExecutionBlocker`, and the half the hold column could
 * not see until LAC-7073.
 *
 * `execution-blocker.js:31` calls `getConversationOwnershipBlocker` BEFORE it
 * looks for a recovery action, and returns its blocker directly. So an issue
 * with no recovery action at all can still be held, and a hold column built
 * only on `issue_recovery_actions` reads it as "no hold" -- which in this
 * lane prints as "deferred behind a run that never released", the wrong
 * reason and the wrong repair.
 *
 * The server holds (`conversation-continuation.js:83-129`) when, for any
 * terminal legacy conversation run on the issue carrying a PID, a process
 * group, a held lease or a retained-workspace recovery schema:
 *
 * 1. the run has a required workspace recovery and its retained remote leases
 *    have not all produced a termination receipt; or
 * 2. its recorded PID is alive and its start time equals the recorded one; or
 * 3. its recorded process GROUP is alive; or
 * 4. it still holds an environment lease.
 *
 * ## Why this needed its own issue, and what the measurement actually said
 *
 * LAC-7022's docstring claimed "there are 0 ownership holds on the board".
 * That claim is wrong, and the way it is wrong is the whole content of this
 * change. It was reached by probing arm 2 only: 931 candidate runs, 6 with a
 * live PID, all 6 recycled, therefore 0. Arm 3 was never probed, and the
 * server applies **no recycled-id comparison to a process group** -- the
 * `process_started_at` check at `conversation-continuation.js:113-118` guards
 * `pidAlive` and nothing else. A recycled group id is therefore a permanent
 * hold that no evidence can retire.
 *
 * Re-measured 2026-11-05 ~19:00Z, 885 candidate runs on 290 non-terminal
 * issues (the earlier 931/310 shrank as issues closed), every arm probed:
 *
 * - Arm 1: **0 rows**. No candidate carries the recovery schema at all.
 * - Arm 4: **0 rows**. 0 candidates hold a lease. (9 unreleased leases exist
 *   board-wide; none belongs to a candidate run on a non-terminal issue.)
 * - Arm 2: 5 live PIDs, all 5 recycled by `ps -o lstart=`, so **0 holds** --
 *   the LAC-7022 number, reproduced. The rejection is sound: see "The
 *   start-time comparison works" below.
 * - Arm 3: **4 holds**, on LAC-4931, LAC-5194, LAC-5986 and LAC-6321. Each
 *   run recorded pid == pgid (the adapter is its own group leader), the pid
 *   arm correctly rejects it as recycled, and the group arm then reinstates
 *   the hold with no recycle guard available to it. Verified against the host
 *   independently of `kill(-pgid, 0)`: `ps -A -o pgid=` shows exactly one
 *   process in each group, and all four are unrelated system daemons --
 *   `locationd` (591), `BiomeAgent` (961), a WebKit content process (1878),
 *   `secinitd` (29835).
 *
 * ## The start-time comparison works, and the writer nobody opens is why
 *
 * The obvious reading of the server source says this arm cannot fire, and it
 * is wrong. That reading: the spawn site records `new Date().toISOString()`
 * (`adapter-utils/src/server-utils.ts`), a **millisecond** value, and the
 * compare site tests it for exact equality against `ps -o lstart=`
 * (`conversation-continuation.js:116`), which has **second** resolution, so
 * they agree only when the spawn fell on an exact second -- about 1 in 1000,
 * making the pid hold dead by construction. Two files, both real, and the
 * conclusion still does not follow, because the value in the column is not
 * the one the adapter recorded. `persistHeartbeatRunProcessMetadata`
 * (`server/dist/services/heartbeat/run-lifecycle.js:264`) reads the OS itself
 * -- `readProcessStartedAt(meta.pid)` -- and keeps the adapter's timestamp
 * only as a fallback for a remote target or an unreadable PID. Both sides of
 * the compare therefore come from `ps`, at second resolution, and exact
 * equality is the correct test.
 *
 * Measured 2026-11-12 against the live instance (server `2026.1106.0`,
 * upstream commit `d69631b0`), three ways:
 * - `heartbeat_runs.process_started_at` carries zero milliseconds on
 *   **1455/1455** rows created in October and **1305/1305** in November.
 *   September is the transition month (173/565), and April-August are
 *   **8 of 7850** -- a rate of 1 in 981, which is the "1 in 1000"
 *   coincidence the paragraph above predicts, and the proof that the old
 *   writer really did behave that way. The OS-preferring writer landed
 *   upstream in `7b094724e6` (#12845, 2026-09-04), exactly where the data
 *   turns over.
 * - All 4 runs that were `running` during the probe match `ps -o lstart=` to
 *   the second, including this agent's own run.
 * - The server's predicate, run verbatim against those 4 pids, calls none of
 *   them recycled.
 *
 * One residual, named so that it is not rediscovered as the main case: when
 * the fallback does fire (remote target, or `ps` fails inside its 1.5s
 * timeout) the stored value keeps its milliseconds, can never equal a later
 * `ps` read, and that run's pid hold is lost. Incidence on this instance:
 * **0 of 2760** local terminal rows since 2026-10-01. The upstream fix is the
 * one-second tolerance already written for the native path
 * (`definitivelyDifferentProcessStart` in `native-restart-recovery.ts`, whose
 * comment names this exact macOS whole-second problem) and not used by the
 * legacy path. Deliberately not replicated here: this script mirrors the
 * server, and the server compares exactly.
 *
 * All four held issues carry **zero** recovery actions, which is precisely the
 * false negative this arm closes. None is currently in this lane (0 deferred
 * wakes each), so like the cause filter in LAC-7022 this changes no line
 * anyone read today; it is a correctness guard against the next strand that
 * lands on an issue the server is already holding for a reason the column
 * could not name.
 *
 * ## Two deliberate divergences, both toward reporting a hold
 *
 * - `hasRequiredWorkspaceRecovery` needs `workspaceRestoreFailure` to be one
 *   of `WORKSPACE_RESTORE_FAILURE_CODES`. Pinning a third list here buys a
 *   third drift test for a branch with 0 rows, so the SQL asks only that the
 *   key be present. Strictly more permissive, so it can only add a hold.
 * - The host probe is the server's, not an improvement on it. A recycled
 *   process group reports as a hold because the server holds on it. Teaching
 *   this column to be cleverer than `getExecutionBlocker` would make it
 *   disagree with the thing it exists to report.
 */
export interface OwnershipCandidate {
  /** Issue identifier, so rows can be grouped per issue as the server does. */
  identifier: string;
  runId: string;
  processPid: number | null;
  processGroupId: number | null;
  /** Recorded process start, epoch ms. Null when the run never wrote one. */
  processStartedAtMs: number | null;
  /** A lease on this run that is unreleased, `pending_cleanup` or failed. */
  leaseHeld: boolean;
  /** `workspaceRestoreRecovery.schema` matched and a restore failure is set. */
  workspaceRecovery: boolean;
  /** `workspaceRestoreRecovery.leaseIds`, the leases the run asked to keep. */
  retainedLeaseIds: string[];
  /** Every non-`local` lease on this run. */
  remoteLeaseIds: string[];
  /** Those of them carrying a complete `paperclip.remote-termination.v1`. */
  receiptLeaseIds: string[];
  /** True when at least one lease on the run has provider exactly `local`. */
  hasLocalLease: boolean;
}

/**
 * Injected so the decision is testable without a live process. Without this
 * the arm would be net harmful: a liveness-only version reports the 5 recycled
 * PIDs above as holds, which is worse than the gap it closes.
 */
export interface ProcessProbe {
  /** `process.kill(target, 0)`: true unless `ESRCH`. `EPERM` means alive. */
  mayBeAlive(target: number): boolean;
  /** Observed start, epoch ms, or null when it cannot be read. */
  startedAtMs(pid: number): number | null;
}

export interface OwnershipHold {
  /** The run whose authority was never confirmed to have ended. */
  runId: string;
  /** The server's own cause string for this blocker. */
  cause: "execution_owner_active";
  /** Which arm held, in the words an operator needs to clear it. */
  note: string;
}

/**
 * `getConversationOwnershipBlocker` for one issue's candidates, in the
 * server's order. Candidates must arrive `created_at DESC, id DESC`; the first
 * one that holds wins, exactly as the server's loop returns early.
 */
export function ownershipHold(
  candidates: OwnershipCandidate[],
  probe: ProcessProbe
): OwnershipHold | null {
  for (const candidate of candidates) {
    if (candidate.workspaceRecovery) {
      // Faithful to the server: a retained set must be non-empty, every
      // retained id must be a remote lease with a receipt, and every remote
      // lease must have one. An empty `leaseIds` therefore holds.
      const receipts = new Set(candidate.receiptLeaseIds);
      const remoteStopped =
        candidate.retainedLeaseIds.length > 0 &&
        candidate.retainedLeaseIds.every((id) => receipts.has(id)) &&
        candidate.remoteLeaseIds.every((id) => receipts.has(id));
      if (!remoteStopped) {
        return {
          runId: candidate.runId,
          cause: "execution_owner_active",
          note: "retained remote workspace has not confirmed it stopped",
        };
      }
      // Those PIDs came from the sandbox, so a match on this host is somebody
      // else. The server skips the process checks unless a local lease exists.
      if (!candidate.hasLocalLease) continue;
    }

    let pidAlive = candidate.processPid !== null && probe.mayBeAlive(candidate.processPid);
    let recycled = false;
    if (pidAlive && candidate.processStartedAtMs !== null) {
      // An unreadable identity stays conservative: the original process may
      // still own execution, so the hold survives a null here. Inequality IS
      // recycling evidence: the server stores the OS start time, not the
      // adapter's millisecond one, so both sides are whole seconds. See "The
      // start-time comparison works" above, including the one fallback case.
      const observed = probe.startedAtMs(candidate.processPid as number);
      if (observed !== null && observed !== candidate.processStartedAtMs) {
        pidAlive = false;
        recycled = true;
      }
    }
    const groupAlive =
      candidate.processGroupId !== null && probe.mayBeAlive(-candidate.processGroupId);

    if (pidAlive || groupAlive || candidate.leaseHeld) {
      const notes: string[] = [];
      if (pidAlive) notes.push(`pid ${candidate.processPid} alive`);
      if (groupAlive) {
        // The server has no recycle guard on a group, so the group id may now
        // belong to an unrelated process. Say so, and who must check.
        notes.push(
          `process group ${candidate.processGroupId} alive` +
            (recycled ? `, recorded pid ${candidate.processPid} is recycled` : "") +
            "; verify with ps -A -o pid,pgid,comm before stopping anything"
        );
      }
      if (candidate.leaseHeld) notes.push("environment lease not released");
      return { runId: candidate.runId, cause: "execution_owner_active", note: notes.join("; ") };
    }
  }
  return null;
}

/**
 * The precedence between the two holds, as one pure function both lanes call.
 *
 * `getExecutionBlocker` (`execution-blocker.js:31`) calls
 * `getConversationOwnershipBlocker` FIRST and returns its blocker directly, so
 * when both are present the recovery action is not the blocker the server would
 * report. An issue can carry either, both, or neither.
 *
 * This existed only as two lines inside `readBoard`'s deferred mapper until
 * LAC-8030. It is lifted out for two reasons: the park lane needs the same
 * precedence, and inline in a mapper that needs a live Postgres connection the
 * rule was untestable -- which is how the park lane went a release without it
 * and nothing failed (LAC-7101 seeded question 1).
 */
export function mergeHold(
  sqlHoldCause: string,
  ownership: OwnershipHold | null
): { cause: string; note: string } {
  if (ownership) return { cause: ownership.cause, note: ownership.note };
  return { cause: sqlHoldCause, note: "" };
}

/**
 * The real probe. `spawnSync` rather than the server's `execFile` because this
 * script is synchronous at this point and the cost is one `ps` per live PID --
 * 5 of 885 candidates on the measured board.
 */
export function hostProcessProbe(): ProcessProbe {
  return {
    mayBeAlive(target: number): boolean {
      try {
        process.kill(target, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== "ESRCH";
      }
    },
    startedAtMs(pid: number): number | null {
      const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
        encoding: "utf8",
        timeout: 1_500,
      });
      if (result.status !== 0 || typeof result.stdout !== "string") return null;
      const parsed = Date.parse(result.stdout.trim());
      return Number.isFinite(parsed) ? parsed : null;
    },
  };
}

/**
 * Ownership candidates for a named set of issues, `$2` as a text[] of
 * identifiers. Scoped to the rows the two lanes named rather than the whole
 * board so a quiet run (both lanes empty) costs nothing: `readBoard` skips the
 * query. Since LAC-8030 the set is the UNION of both lanes, not just the
 * deferred one -- the park lane needs the same answer and `$2` is the only
 * thing that has to change for it to get one.
 *
 * The candidate WHERE is `getConversationOwnershipBlocker`'s own, including the
 * schema-only arm of its `or(...)` -- the restore-failure half is applied per
 * row as `workspace_recovery`, where the server applies it, inside the loop.
 */
const OWNERSHIP_QUERY = `
  SELECT i.identifier,
         r.id::text AS run_id,
         r.process_pid,
         r.process_group_id,
         (extract(epoch FROM r.process_started_at) * 1000)::bigint AS process_started_at_ms,
         EXISTS (
           SELECT 1 FROM environment_leases el
            WHERE el.company_id = r.company_id
              AND el.heartbeat_run_id = r.id
              AND (el.released_at IS NULL
                   OR el.status = 'pending_cleanup'
                   OR el.cleanup_status = 'failed')
         ) AS lease_held,
         (r.result_json ->> 'workspaceRestoreFailure' IS NOT NULL
          AND r.result_json -> 'workspaceRestoreRecovery' ->> 'schema'
              = 'paperclip.workspace-restore-recovery.v1') AS workspace_recovery,
         coalesce((
           SELECT array_agg(v)
             FROM jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(r.result_json -> 'workspaceRestoreRecovery'
                                             -> 'leaseIds') = 'array'
                         THEN r.result_json -> 'workspaceRestoreRecovery' -> 'leaseIds'
                         ELSE '[]'::jsonb END) AS v
         ), '{}') AS retained_lease_ids,
         coalesce((
           SELECT array_agg(el.id::text)
             FROM environment_leases el
            WHERE el.company_id = r.company_id
              AND el.heartbeat_run_id = r.id
              AND coalesce(el.provider, '') <> 'local'
         ), '{}') AS remote_lease_ids,
         coalesce((
           SELECT array_agg(el.id::text)
             FROM environment_leases el
            WHERE el.company_id = r.company_id
              AND el.heartbeat_run_id = r.id
              AND el.provider IS NOT NULL
              AND el.provider <> 'local'
              AND el.provider_lease_id IS NOT NULL
              AND el.released_at IS NOT NULL
              AND el.cleanup_status = 'success'
              AND el.status IN ('released', 'expired', 'failed')
              AND el.metadata -> 'remoteExecutionTermination' ->> 'schema'
                  = 'paperclip.remote-termination.v1'
              AND el.metadata -> 'remoteExecutionTermination' ->> 'companyId'
                  = el.company_id::text
              AND el.metadata -> 'remoteExecutionTermination' ->> 'runId'
                  = el.heartbeat_run_id::text
              AND el.metadata -> 'remoteExecutionTermination' ->> 'leaseId' = el.id::text
              AND el.metadata -> 'remoteExecutionTermination' ->> 'provider' = el.provider
              AND el.metadata -> 'remoteExecutionTermination' ->> 'providerLeaseId'
                  = el.provider_lease_id
              AND el.metadata -> 'remoteExecutionTermination' ->> 'state'
                  IN ('stopped', 'destroyed')
         ), '{}') AS receipt_lease_ids,
         EXISTS (
           SELECT 1 FROM environment_leases el
            WHERE el.company_id = r.company_id
              AND el.heartbeat_run_id = r.id
              AND el.provider = 'local'
         ) AS has_local_lease
    FROM issues i
    JOIN heartbeat_runs r
      ON r.company_id = i.company_id
     AND coalesce(r.native_issue_id::text, r.context_snapshot ->> 'issueId') = i.id::text
   WHERE i.company_id <> $1
     AND i.identifier = ANY($2)
     AND r.runtime_mode = 'legacy'
     AND r.status IN ('failed', 'timed_out', 'interrupted', 'cancelled')
     AND (r.runner_profile_json -> 'adapterDispatch' ->> 'adapterType'
            IN (${ADAPTERS_SQL})
          OR r.result_json ->> 'conversationContinuation' = 'continue_conversation_v1'
          OR EXISTS (
               SELECT 1
                 FROM heartbeat_run_events e
                WHERE e.company_id = r.company_id
                  AND e.run_id = r.id
                  AND e.event_type = 'adapter.invoke'
                  AND e.payload ->> 'adapterType' IN (${ADAPTERS_SQL})
             ))
     AND (r.process_pid IS NOT NULL
          OR r.process_group_id IS NOT NULL
          OR r.result_json -> 'workspaceRestoreRecovery' ->> 'schema'
             = 'paperclip.workspace-restore-recovery.v1'
          OR EXISTS (
               SELECT 1 FROM environment_leases el
                WHERE el.company_id = r.company_id
                  AND el.heartbeat_run_id = r.id
                  AND (el.released_at IS NULL
                       OR el.status = 'pending_cleanup'
                       OR el.cleanup_status = 'failed')
             ))
   ORDER BY i.identifier, r.created_at DESC, r.id DESC
`;

/**
 * The park lane. Defined after `HOLD_LATERAL` because it interpolates it;
 * it reads first in the DM and last in this file.
 *
 * The hold column is the LAC-7846 half. Without it this lane printed the
 * same `no wake path` for two opposite situations: an issue nothing will
 * ever wake, where a status flip is the repair, and an issue carrying an
 * execution hold, where a status flip is reverted by the watchdog within
 * ~40s and mints another `replay = 'blocked'` row on the way out. Measured
 * 2026-11-12 on LAC-7846: 37 non-terminal issues carried the hold and only
 * 2 of them had a saved wake, so the deferred lane -- the only lane that
 * had this column -- could see 2. LAC-5591 was being named by THIS lane, in
 * the 2026-11-12 DM, as `16d, no wake path`, while the thing holding it was
 * `legacy_execution_requires_reconciliation`.
 *
 * Naming the hold is the whole fix. The repair for one is board-only
 * (`POST /api/issues/:id/recovery-actions/resolve`, 403 `Board access
 * required` for an agent key, measured) and needs recorded evidence of what
 * the stopped run actually did, so a reader who cannot tell the two apart
 * does the wrong thing by default.
 *
 * This column is only half the hold, and the half that is here is the one the
 * server checks SECOND. `h.cause` reads `issue_recovery_actions`; the ownership
 * arm is a different table and `readBoard` merges it in (`mergeHold`,
 * LAC-8030). Before that merge this lane printed `no wake path` for an issue
 * the server holds as `execution_owner_active` -- the same false negative
 * LAC-7846 closed for recovery actions, in the arm it did not reach.
 */
const QUERY = `
  SELECT i.identifier,
         i.title,
         coalesce(a.name, '') AS assignee,
         (extract(epoch FROM coalesce(i.blocked_transition_at, i.updated_at)) * 1000)::bigint AS stranded_since_ms,
         coalesce(ra.cause, '') AS recovery_cause,
         coalesce(ra.owner_type, '') AS recovery_owner,
         (i.unblock_descriptor IS NOT NULL) AS has_descriptor,
         coalesce(h.cause, '') AS hold_cause
    FROM issues i
    LEFT JOIN agents a ON a.id = i.assignee_agent_id
    LEFT JOIN issue_recovery_actions ra
           ON ra.source_issue_id = i.id AND ra.status = 'active'
${HOLD_LATERAL}
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

    // The ownership arm runs only over the issues the two lanes actually named,
    // so a quiet board (both lanes empty) pays nothing for it. One query over
    // the union rather than one per lane: the two lanes overlap by design -- a
    // parked issue is exactly the kind that also has saved wakes -- and two
    // queries would probe the same runs twice and could disagree about the
    // hold on an issue in both (LAC-8030). Grouped per issue because the
    // server's blocker is per issue, and left in query order so the first
    // candidate that holds is the one the server would have named.
    //
    // Measured 2026-11-13: 43 park rows + 0 deferred -> 53 candidate runs on 16
    // issues, ~11s. The watch runs once a day (`paperclip-sweep.sh`), so the
    // cost is bounded and paid where the answer is wrong without it.
    const identifiers = [
      ...new Set([...blockedRows, ...deferredRows].map((row) => String(row.identifier))),
    ];
    const candidates = new Map<string, OwnershipCandidate[]>();
    if (identifiers.length > 0) {
      const rows = (await sql.unsafe(OWNERSHIP_QUERY, [
        GHOST_COMPANY_ID,
        identifiers,
      ])) as unknown as Row[];
      for (const row of rows) {
        const identifier = String(row.identifier);
        const list = candidates.get(identifier) ?? [];
        list.push({
          identifier,
          runId: String(row.run_id),
          processPid: row.process_pid === null ? null : Number(row.process_pid),
          processGroupId: row.process_group_id === null ? null : Number(row.process_group_id),
          processStartedAtMs:
            row.process_started_at_ms === null ? null : Number(row.process_started_at_ms),
          leaseHeld: row.lease_held === true,
          workspaceRecovery: row.workspace_recovery === true,
          retainedLeaseIds: (row.retained_lease_ids as string[] | null) ?? [],
          remoteLeaseIds: (row.remote_lease_ids as string[] | null) ?? [],
          receiptLeaseIds: (row.receipt_lease_ids as string[] | null) ?? [],
          hasLocalLease: row.has_local_lease === true,
        });
        candidates.set(identifier, list);
      }
    }
    const probe = hostProcessProbe();

    // The probe is per issue and both lanes ask the same question of it, so it
    // is memoised: an issue named by both lanes must not get two answers, and
    // `ownershipHold` shells out to `ps` for every live pid it meets.
    const holds = new Map<string, OwnershipHold | null>();
    const holdFor = (identifier: string): OwnershipHold | null => {
      if (!holds.has(identifier)) {
        holds.set(identifier, ownershipHold(candidates.get(identifier) ?? [], probe));
      }
      return holds.get(identifier) ?? null;
    };

    return {
      blocked: blockedRows.map((row) => {
        const identifier = String(row.identifier);
        const hold = mergeHold(String(row.hold_cause ?? ""), holdFor(identifier));
        return {
          identifier,
          title: String(row.title),
          assignee: String(row.assignee ?? ""),
          strandedSinceMs: Number(row.stranded_since_ms),
          recoveryCause: String(row.recovery_cause ?? ""),
          recoveryOwner: String(row.recovery_owner ?? ""),
          hasDescriptor: row.has_descriptor === true,
          holdCause: hold.cause,
          holdNote: hold.note,
        };
      }),
      deferred: deferredRows.map((row) => {
        const identifier = String(row.identifier);
        const hold = mergeHold(String(row.hold_cause ?? ""), holdFor(identifier));
        return {
          identifier,
          title: String(row.title),
          assignee: String(row.assignee ?? ""),
          waiter: String(row.waiter ?? ""),
          savedCount: Number(row.saved_count),
          oldestMs: Number(row.oldest_ms),
          waitReason: String(row.wait_reason ?? ""),
          holdCause: hold.cause,
          holdNote: hold.note,
        };
      }),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * Reads git in the script's OWN checkout, derived from `import.meta.path`, not
 * from the process cwd: the point is which copy of this file is executing, and
 * the invocation's cwd is the same thing only by convention.
 *
 * `repo` is a parameter rather than being computed inside, so a test can point
 * it at a temp repo while cwd is somewhere else entirely. That is the one branch
 * the whole function exists for, and it is unreachable from a test otherwise
 * (LAC-7050 nit 1).
 *
 * git runs through `node:child_process`, not `Bun.spawn`. The unit suite runs
 * under vitest on Node, where `Bun` is undefined, so a `Bun.spawn` here throws,
 * is swallowed by the catch below and returns all-nulls -- which looks exactly
 * like "not a repo" and made the first two tests of this function fail and the
 * third pass for the wrong reason. `node:child_process` runs on both runtimes,
 * so the test exercises the same code path production does (LAC-7050 nit 1).
 *
 * The default argument uses `import.meta.path`, which is Bun-only. Production
 * runs under bun (shebang, and launchd invokes bun), so the default is right
 * there; under Node it is undefined, the default throws, the catch returns
 * all-nulls and `formatDeployAlert` says "cannot tell" -- loud, not silent,
 * which is the safe direction. Tests must always pass `repo` explicitly.
 */
export function readDeployState(
  repo: string = path.dirname(path.dirname(import.meta.path))
): DeployState {
  const run = (args: string[]): string | null => {
    try {
      const result = spawnSync("git", ["-C", repo, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (result.status !== 0) return null;
      const out = (result.stdout ?? "").trim();
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  };
  /**
   * Two candidate paths, and the order is load-bearing: this checkout's OWN
   * `FETCH_HEAD` first, the shared one only when it has none.
   *
   * `~/repo/buildandserve-ops`, the checkout the sweep runs this from, is not a
   * plain clone -- it is a `git worktree` of `~/repo/buildandserve` (measured
   * 2026-11-05). So `--git-path FETCH_HEAD` points into
   * `.git/worktrees/buildandserve-ops/`, which its own pulls write, while
   * `--git-common-dir` holds a second `FETCH_HEAD` that every other session's
   * fetch in the main checkout touches. Note `refs/remotes/origin/main` itself
   * is shared, so a sibling's full fetch does refresh it for this checkout too;
   * the risk in newest-wins is a sibling fetching some OTHER branch, which
   * touches the shared `FETCH_HEAD` without moving `origin/main`. Own-first
   * trades that false negative for a rare false alarm (own pull failing for two
   * days while a sibling's succeeds), which is the louder and safer error here.
   *
   * The fallback still matters: a worktree that has never fetched on its own
   * has no per-worktree file at all, and reading that as "never fetched" would
   * alarm on a healthy by-hand run.
   */
  const fetchHeadMtime = (): number | null => {
    const gitPath = run(["rev-parse", "--git-path", "FETCH_HEAD"]);
    const commonDir = run(["rev-parse", "--git-common-dir"]);
    const candidates = [gitPath, commonDir === null ? null : path.join(commonDir, "FETCH_HEAD")]
      .filter((p): p is string => p !== null)
      // `--git-path` answers relative to the repo in a plain clone and absolute
      // inside a worktree.
      .map((p) => (path.isAbsolute(p) ? p : path.join(repo, p)));
    for (const file of candidates) {
      try {
        return statSync(file).mtimeMs;
      } catch {
        // Nothing at that path; try the next. Missing from both means no fetch
        // has ever landed here, which `formatFetchAlert` reports rather than
        // treating as fresh. Any error lands here, not only ENOENT, so an
        // unreadable file (EACCES) also reads as "no fetch on record": the alarm
        // fires with slightly wrong wording rather than staying silent.
      }
    }
    return null;
  };
  return {
    head: run(["rev-parse", "HEAD"]),
    originMain: run(["rev-parse", "origin/main"]),
    branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
    lastFetchMs: fetchHeadMtime(),
  };
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

  // Exit 2 is "could not look". With --notify it is also said out loud, once a
  // day at most, so a broken watch cannot pass for a quiet board.
  const blind = async (reason: string): Promise<never> => {
    console.error(reason);
    if (argv.includes("--notify")) {
      const marker = `${statePath}.blind-day`;
      const today = new Date().toISOString().slice(0, 10);
      const last = await readFile(marker, "utf8").catch(() => "");
      if (last.trim() !== today) {
        const failure = await slackDm(formatBlindAlert(reason));
        if (failure) console.error(failure);
        else {
          await mkdir(path.dirname(marker), { recursive: true });
          await writeFile(marker, `${today}\n`).catch(() => undefined);
        }
      }
    }
    process.exit(EXIT_COULD_NOT_LOOK);
  };

  const url = process.env.PAPERCLIP_DB_URL;
  if (!url) {
    return blind("PAPERCLIP_DB_URL must be set (postgres://... for the Paperclip control plane)");
  }

  let issues: BlockedIssue[];
  let deferredWakes: DeferredWake[];
  try {
    const board = await readBoard(url);
    issues = board.blocked;
    deferredWakes = board.deferred;
  } catch (error) {
    // "Could not look" must never be logged as "nothing is parked", and it must
    // not consume the one alert a real park would get.
    return blind(`could not read the Paperclip database: ${(error as Error).message}`);
  }

  const now = Date.now();
  const verdict = classify(issues, now);
  const current = stranded(verdict);
  const deferredVerdict = classifyDeferred(deferredWakes, now);
  const currentDeferred = deferredVerdict.stranded;
  const seenKeys = await readSeenKeys(statePath);
  const isBaseline = seenKeys === null;

  // Read before the silent exit below. A stale deploy on an empty board is the
  // worst version of this: the report is silent AND the copy producing the
  // silence is not the one that was merged.
  const deployState = readDeployState();
  const deployAlert = formatDeployAlert(deployState);
  const deployIsNews =
    deployAlert !== null && (isBaseline || !seenKeys!.includes(deployKey(deployState)));
  const fetchAlert = formatFetchAlert(deployState, now);
  const fetchIsNews =
    fetchAlert !== null && (isBaseline || !seenKeys!.includes(fetchKey(deployState)));
  const copyStateKeys = [
    ...(deployAlert === null ? [] : [deployKey(deployState)]),
    ...(fetchAlert === null ? [] : [fetchKey(deployState)]),
  ];

  // Fetch line first: it says whether the deploy comparison itself is reading a
  // current `origin/main`.
  if (fetchAlert !== null) console.log(fetchAlert);
  if (deployAlert !== null) console.log(deployAlert);

  if (current.length === 0 && currentDeferred.length === 0 && !deployIsNews && !fetchIsNews) {
    // Healthy is silent. Record the empty set so a later park reads as new,
    // keeping the deploy and fetch keys so neither is re-reported every day.
    if (!isBaseline) await writeSeenKeys(statePath, copyStateKeys);
    // Exit 0 even on a standing stale deploy or stale fetch. The contract is
    // "1 = something is parked", the sweep discards anything under 2, and this
    // path told nobody -- so a 1 here is a claim no reader ever sees and the
    // runbook's own exit table contradicts. The line is already on stdout.
    // A trust line that IS news keeps the 1 below: that one did tell someone.
    process.exit(EXIT_QUIET);
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
    // First, because they say whether to trust the rest.
    ...(fetchIsNews ? [fetchAlert!] : []),
    ...(deployIsNews ? [deployAlert!] : []),
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
        ...copyStateKeys,
      ]);
  }

  process.exit(EXIT_PARKED);
}

// Guarded so the pure helpers above can be imported by tests without touching
// Postgres, the filesystem or Slack.
if (import.meta.main) {
  main().catch((error) => {
    // Same class as the two `blind` paths: the watch did not look. Not routed
    // through `blind` because this catch is outside `main`'s scope, so an
    // unexpected throw is still only a log line (LAC-6580 follow-up).
    console.error("stranded watch failed:", error);
    process.exit(EXIT_COULD_NOT_LOOK);
  });
}
