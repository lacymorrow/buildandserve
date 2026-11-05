#!/usr/bin/env bun
/**
 * Puts back the work a bulk agent pause knocked over (LAC-5079).
 *
 * Pausing an agent kills its in-flight run. The run dies before the agent gets
 * control back, so the recovery service parks the issue in `blocked` under a
 * `stranded_assigned_issue` action it files on behalf of the board, and that
 * action is never delivered: `ownerType` falls to `"board"` when no agent owner
 * resolves and the wake enqueuer returns on its first line when there is no
 * owner agent. Same undelivered-action defect as LAC-4586, different cause.
 *
 * The pause is reversible. Its damage is not, and that is the whole bug. On
 * 2026-10-18 Lacy paused 14 of 22 agents between 07:00:26Z and 07:00:38Z; two
 * days later, with nobody paused, 7 of those parks were still live and the
 * issues had not moved since.
 *
 * ## Why LAC-4586's retry does not cover this
 *
 * Two independent reasons, either one sufficient. `paperclip-lease-loss-retry.ts`
 * matches `error = 'Legacy controller lease lost'` literally and a pause-killed
 * run carries `agent_paused` instead; and even if it matched, its 2h cap from the
 * request would correctly skip a park that is days old. A paused agent is also an
 * explicit `operator_hold` skip there, which is right. Nothing un-does the hold's
 * collateral damage once the operator lifts it. This does.
 *
 * ## The lever, and why it is this one
 *
 * `PATCH /api/issues/:id {status}`. The platform recognises the write: it cancels
 * the stranded action itself with "Recovery action became stale because the source
 * issue was manually moved from blocked to todo", and its own liveness dispatch
 * queues the run. Nothing synthetic, no `POST /wakeup`, and no second wake path to
 * keep working.
 *
 * Measured on the live board 2026-10-20: 16 parks moved `blocked` -> `todo` at
 * 16:28:30-37Z, all 16 actions cancelled with that note, and 16 runs queued on
 * their assignees. LAC-4837 again at 17:21Z under this script's own rules.
 *
 * Two things that are NOT true here, despite looking identical in a point-in-time
 * query, and both verified rather than assumed:
 *
 *   - A raw `UPDATE issues SET status` does not stick. The server re-derives status
 *     and bumps `status_version` back over it. Writes go through the API
 *     (`phantom-block-sweep.sh`, LAC-4910).
 *   - `phantom-block-sweep.sh` classifies an issue with any active recovery action
 *     as `platform:recovery-action-active`, "do NOT PATCH these". That holds for
 *     `active_run_watchdog` and `configuration_incomplete`, which re-park inside
 *     ~2s and were what it measured. It does not hold for
 *     `stranded_assigned_issue`, which cancels and stays cancelled. The two causes
 *     need opposite treatment, which is why this is a separate file and not a
 *     relaxed predicate over there.
 *
 * ## It restores to `todo`, not to the recorded previous status
 *
 * The one place it does not simply replay what the platform recorded. 6 of the 8
 * live parks carry `evidence.previousStatus = "in_progress"`, and restoring that
 * would be a lie about reality: the run is dead, there is no session to resume,
 * and nothing in Paperclip dispatches an assigned `in_progress` issue, so it would
 * trade a visible park for an invisible stall. `todo` means "assigned, not
 * started", which is exactly true after a pause killed the run, and it is the only
 * dispatch this board has 16 same-day observations of.
 *
 * `in_review` and `backlog` parks are skipped instead of rewritten: `todo` on an
 * `in_review` issue sends an engineer back into work a reviewer already holds, and
 * `backlog` wakes nobody either way. They stay parked and
 * `paperclip-stranded-watch.ts` reports them.
 *
 * ## Rate limiting, which is a headroom test and not an idleness test
 *
 * Restoring the backlog at once is the failure mode, not the fix: the LAC-4573
 * batch queued ~30 runs and drove load to 365, and the 16:28Z batch above left
 * Founding Engineer 16 runs deep. But "skip while the agent is busy" would never
 * drain a saturated agent, and the agent holding 6 of the 8 live parks is
 * saturated precisely because of them. So the gate is queue depth, not idleness:
 * restore into an agent with fewer than `MAX_AGENT_QUEUE` runs outstanding, one
 * per agent per pass, `MAX_PER_PASS` board-wide. At the 10-minute sweep cadence
 * that drains 6/hour/agent into agents that have room, and stalls by design while
 * the board is full.
 *
 * ## It never comments
 *
 * A comment on a parked issue fires `issue_reopened_via_comment` and wakes the
 * assignee, which is a second uncounted wake on top of the one the status change
 * already caused (LAC-4573). The status PATCH is the only write.
 *
 * Usage:
 *   bun scripts/paperclip-strand-restore.ts [--dry-run] [--state <path>]
 *
 * Exit codes: 0 = nothing to restore, or restored. 1 = a park it could not write.
 * 2 = could not look.
 *
 * Tourniquet, not a cure. The real fix is upstream: deliver a board-owned recovery
 * action to somebody, and treat an operator pause as suspending in-flight work
 * rather than killing it. Filed with the LAC-4586 report at
 * `docs/ops/upstream-lease-loss-strand.md`. Remove this script and its line in
 * `~/.paperclip/paperclip-sweep.sh` once the pinned prod Paperclip restores its own
 * pause collateral, and note the removal on LAC-5079.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

/** The recovery cause this file owns. Matched literally, never by substring. */
export const STRANDED_CAUSE = "stranded_assigned_issue";

/** The status every restore writes. See the header for why it is not `previousStatus`. */
export const RESTORE_STATUS = "todo";

/**
 * Previous statuses this will restore. `in_review` and `backlog` are deliberately
 * absent and skipped by name, so the log says a park was understood and declined
 * rather than never seen.
 */
export const RESTORABLE_PREVIOUS = new Set(["todo", "in_progress"]);

/**
 * Let the platform's own handling finish first. A park seconds old can still have
 * a run winding down behind it, and writing into that races a path that may yet
 * work. Longer than LAC-4586's 3 minutes because nothing here is time-critical:
 * these parks are measured in days.
 */
export const GRACE_MINUTES = 10;

/**
 * Deliberately no maximum age. Unlike a routine slot, a manual issue parked for
 * two days is usually still worth doing, so copying LAC-4586's 2h cap would skip
 * every park this exists to fix. Staleness is decided on the issue instead: a
 * terminal issue, a live blocker or a newer run all stop the restore, and each of
 * those is a fact about the work rather than a guess from its age.
 */
export const MAX_AGE_HOURS = null;

/**
 * Outstanding runs an owner may already have and still receive a restore. The
 * restored issue is queued by the platform, not run immediately, so the harm this
 * bounds is queue depth, not concurrency.
 */
export const MAX_AGENT_QUEUE = 3;

/** Restores per pass, board-wide. 10-minute cadence, so 18/hour at full tilt. */
export const MAX_PER_PASS = 3;

/**
 * Restores of the same issue before giving up on it. An issue that re-parks after
 * three restores is not a strand this can clear, and hammering it would be a loop.
 * It stays parked and `paperclip-stranded-watch.ts` reports it.
 */
export const MAX_RESTORES_PER_ISSUE = 3;

/** Durable operator holds. Do not fight a hold that is still in force. */
const OPERATOR_HOLD_STATUSES = new Set(["paused", "terminated", "pending_approval"]);

/**
 * Split off on 2026-09-24; the real company runs on another machine. Its board is
 * a frozen copy and not ours to repair. 7 of the 15 live stranded actions on
 * 2026-10-20 were its Banks and Hunter routine slots.
 */
const GHOST_COMPANY_ID = "6002a0d1-a96a-4495-ae4f-dd26400d9602";

const DEFAULT_STATE_PATH = path.join(
  process.env.HOME ?? ".",
  ".paperclip",
  "strand-restore-state.json"
);

/** One parked issue, with the result of every guard resolved in SQL. */
export interface StrandedPark {
  actionId: string;
  issueId: string;
  identifier: string;
  title: string;
  issueStatus: string;
  originKind: string;
  /** The status the recovery action recorded. Read to decide, never written back. */
  previousStatus: string;
  /** When the issue was parked. Grace is measured from here. */
  parkedAtMs: number;
  ownerAgentId: string;
  ownerAgentName: string;
  ownerAgentStatus: string;
  /** Queued or running runs the owner already has. */
  ownerQueueDepth: number;
  /** A run started on this issue after the park. Something already resumed it. */
  newerRunForIssue: boolean;
  /** A blocker that is genuinely unresolved. */
  liveBlockerCount: number;
  /** The assignee named themselves the owner of the unblock. */
  hasUnblockDescriptor: boolean;
  /** A pending card. Restoring would wake an agent into a human wait. */
  pendingCardCount: number;
  /** An active recovery action with some other cause, which needs its own answer. */
  otherActiveActionCause: string;
}

export type Decision = { action: "restore" } | { action: "skip"; reason: string; detail: string };

/**
 * Decide what to do with one parked issue.
 *
 * Ordered cheapest and most permanent first, so the log reads as a reason rather
 * than a race. A park skipped for `live_blocker` will not become restorable on its
 * own; one skipped for `agent_queue_full` very likely will on a later pass, and
 * saying which is which is the difference between a diagnosable miss and a silent
 * one (LAC-4543).
 */
export function decide(
  park: StrandedPark,
  nowMs: number,
  opts: {
    graceMinutes?: number;
    maxAgentQueue?: number;
    maxPerPass?: number;
    maxRestoresPerIssue?: number;
    /** Restores this issue has already had, from the state file. */
    priorRestores?: number;
    /** Agents this pass has already restored a park for. One each. */
    restoredAgentIds?: ReadonlySet<string>;
    /** Restores this pass has already made, against `maxPerPass`. */
    restoredThisPass?: number;
  } = {}
): Decision {
  const graceMinutes = opts.graceMinutes ?? GRACE_MINUTES;
  const maxAgentQueue = opts.maxAgentQueue ?? MAX_AGENT_QUEUE;
  const maxPerPass = opts.maxPerPass ?? MAX_PER_PASS;
  const maxRestoresPerIssue = opts.maxRestoresPerIssue ?? MAX_RESTORES_PER_ISSUE;

  // The issue moved between the scan and here, or the scan is stale. Either way
  // `blocked` is no longer the thing being repaired.
  if (park.issueStatus !== "blocked") {
    return {
      action: "skip",
      reason: "not_parked",
      detail: `the issue is ${park.issueStatus || "in no status"}, not blocked`,
    };
  }
  // Named rather than silently unmatched: see the header on why `todo` is not
  // written over an `in_review` or `backlog` park.
  if (!RESTORABLE_PREVIOUS.has(park.previousStatus)) {
    return {
      action: "skip",
      reason: "previous_status_not_restorable",
      detail: park.previousStatus
        ? `parked from ${park.previousStatus}, which ${RESTORE_STATUS} must not overwrite`
        : "the recovery action recorded no previous status",
    };
  }
  // A routine slot is reproducible by definition and its next slot supersedes it,
  // so re-running a stale one reports a window a later slot already covered. Fresh
  // ones are LAC-4586's job, inside its 2h window.
  if (park.originKind === "routine_execution") {
    return {
      action: "skip",
      reason: "routine_slot",
      detail: "a routine slot is superseded by its next slot, not restored",
    };
  }
  if (park.liveBlockerCount > 0) {
    return {
      action: "skip",
      reason: "live_blocker",
      detail: `${park.liveBlockerCount} unresolved blocker(s); the park is correct`,
    };
  }
  if (park.hasUnblockDescriptor) {
    return {
      action: "skip",
      reason: "assignee_owns_unblock",
      detail: "the assignee named themselves the owner of the unblock",
    };
  }
  if (park.otherActiveActionCause) {
    return {
      action: "skip",
      reason: "other_recovery_action",
      detail: `also parked by ${park.otherActiveActionCause}, which needs its own answer`,
    };
  }
  if (park.pendingCardCount > 0) {
    return {
      action: "skip",
      reason: "pending_card",
      detail: "a pending card would wake the assignee into a human wait",
    };
  }
  // Not the same test as a newer run: an assignment, a board comment or a later
  // slot can start a run without being a resume of this park. Either way the work
  // is moving and a restore is noise.
  if (park.newerRunForIssue) {
    return {
      action: "skip",
      reason: "superseded",
      detail: "a run already started on this issue after the park",
    };
  }
  if ((opts.priorRestores ?? 0) >= maxRestoresPerIssue) {
    return {
      action: "skip",
      reason: "restore_exhausted",
      detail: `already restored ${opts.priorRestores} times and re-parked each time`,
    };
  }
  if (nowMs - park.parkedAtMs < graceMinutes * 60_000) {
    return {
      action: "skip",
      reason: "grace",
      detail: `parked ${formatAge(park.parkedAtMs, nowMs)} ago, inside the ${graceMinutes}m grace window`,
    };
  }
  if (!park.ownerAgentId) {
    return {
      action: "skip",
      reason: "no_owner",
      detail: "nothing to restore it to; `todo` plus unassigned wakes nobody",
    };
  }
  // The condition this file is named for. A hold that is still in force is the
  // operator's decision, and its collateral is theirs to keep until they lift it.
  if (OPERATOR_HOLD_STATUSES.has(park.ownerAgentStatus)) {
    return {
      action: "skip",
      reason: "owner_on_hold",
      detail: `owner ${park.ownerAgentName} is ${park.ownerAgentStatus}, an operator hold`,
    };
  }
  if (park.ownerQueueDepth >= maxAgentQueue) {
    return {
      action: "skip",
      reason: "agent_queue_full",
      detail: `owner ${park.ownerAgentName} already has ${park.ownerQueueDepth} runs outstanding`,
    };
  }
  // `ownerQueueDepth` is resolved in SQL once before the loop, so it cannot see a
  // restore this same pass just made. Six of the eight live parks share one owner,
  // so without this the depth guard reads stale for the second one.
  if (opts.restoredAgentIds?.has(park.ownerAgentId)) {
    return {
      action: "skip",
      reason: "agent_restored_this_pass",
      detail: "this pass already restored a park for the owner",
    };
  }
  if ((opts.restoredThisPass ?? 0) >= maxPerPass) {
    return {
      action: "skip",
      reason: "pass_cap_reached",
      detail: `this pass already restored ${maxPerPass}; the next is 10 minutes away`,
    };
  }
  return { action: "restore" };
}

/** Hours or days, because "parked 2.1d ago" is the number that reads as the bug. */
export function formatAge(sinceMs: number, nowMs: number): string {
  const minutes = (nowMs - sinceMs) / 60_000;
  if (minutes < 90) return `${Math.round(minutes)}m`;
  if (minutes < 2160) return `${Number((minutes / 60).toFixed(1))}h`;
  return `${Number((minutes / 1440).toFixed(1))}d`;
}

export function describe(park: StrandedPark): string {
  return `${park.identifier} (${park.ownerAgentName || "unassigned"}): ${park.title}`;
}

/**
 * One skip line per issue per reason per day. A park skipped for the same reason
 * all day is one log line, not 144; a park whose reason changes says so the moment
 * it changes.
 */
export function skipKey(park: StrandedPark, reason: string, nowMs: number): string {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return `${park.issueId}:${reason}:${day}`;
}

/** What the state file holds per issue. Restores are counted; skips are not. */
export interface RestoreRecord {
  count: number;
  lastAtMs: number;
}

export interface SweepState {
  restores: Record<string, RestoreRecord>;
  skipKeys: string[];
}

export const STATE_RETENTION_DAYS = 14;

/**
 * Restore counts age out after two weeks, so an issue that strands again next
 * month gets its three tries back rather than inheriting an exhausted counter.
 * Skip keys keep today and yesterday only, which is all the de-duplication needs.
 */
export function pruneState(state: SweepState, nowMs: number): SweepState {
  const restoreCutoff = nowMs - STATE_RETENTION_DAYS * 86_400_000;
  const keepDays = new Set([
    new Date(nowMs).toISOString().slice(0, 10),
    new Date(nowMs - 86_400_000).toISOString().slice(0, 10),
  ]);
  return {
    restores: Object.fromEntries(
      Object.entries(state.restores).filter(([, record]) => record.lastAtMs >= restoreCutoff)
    ),
    skipKeys: state.skipKeys.filter((key) => keepDays.has(key.slice(-10))).sort(),
  };
}

const QUERY = `
  SELECT ra.id AS action_id,
         i.id::text AS issue_id,
         coalesce(i.identifier, '') AS identifier,
         coalesce(i.title, '') AS title,
         coalesce(i.status, '') AS issue_status,
         coalesce(i.origin_kind, '') AS origin_kind,
         coalesce(ra.evidence ->> 'previousStatus', '') AS previous_status,
         (extract(epoch FROM ra.created_at) * 1000)::bigint AS parked_at_ms,
         coalesce(i.assignee_agent_id::text, '') AS owner_agent_id,
         coalesce(a.name, '') AS owner_agent_name,
         coalesce(a.status, '') AS owner_agent_status,
         (
           SELECT count(*) FROM heartbeat_runs r
            WHERE r.agent_id = i.assignee_agent_id
              AND r.status IN ('queued', 'running')
         )::int AS owner_queue_depth,
         EXISTS (
           SELECT 1 FROM heartbeat_runs r
            WHERE r.context_snapshot ->> 'issueId' = i.id::text
              AND r.created_at > ra.created_at
         ) AS newer_run_for_issue,
         (
           SELECT count(*) FROM issue_relations rel
             JOIN issues b ON b.id = rel.issue_id
            WHERE rel.related_issue_id = i.id
              AND rel.type = 'blocks'
              AND b.status NOT IN ('done', 'cancelled')
         )::int AS live_blocker_count,
         (i.unblock_descriptor IS NOT NULL) AS has_unblock_descriptor,
         (
           SELECT count(*) FROM issue_thread_interactions t
            WHERE t.issue_id = i.id AND t.status = 'pending'
         )::int AS pending_card_count,
         coalesce((
           SELECT o.cause FROM issue_recovery_actions o
            WHERE o.source_issue_id = i.id
              AND o.status = 'active'
              AND o.cause <> $1
            ORDER BY o.created_at
            LIMIT 1
         ), '') AS other_active_action_cause
    FROM issue_recovery_actions ra
    JOIN issues i ON i.id = ra.source_issue_id
    LEFT JOIN agents a ON a.id = i.assignee_agent_id
   WHERE ra.cause = $1
     AND ra.status = 'active'
     AND ra.company_id <> $2
     AND i.status = 'blocked'
     AND i.hidden_at IS NULL
   ORDER BY ra.created_at
`;

/**
 * Read the parks straight from Postgres. The URL is required rather than defaulted
 * so this file holds no credential, and so a typo fails loudly instead of quietly
 * repairing the wrong database.
 */
async function readParks(url: string): Promise<StrandedPark[]> {
  // Timeouts, because a wedged database must not wedge the repair. launchd would
  // otherwise hold one hung process and skip every cycle after it.
  const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5 });
  try {
    const rows = (await sql.unsafe(QUERY, [STRANDED_CAUSE, GHOST_COMPANY_ID])) as unknown as Record<
      string,
      unknown
    >[];
    return rows.map((row) => ({
      actionId: String(row.action_id),
      issueId: String(row.issue_id),
      identifier: String(row.identifier ?? ""),
      title: String(row.title ?? ""),
      issueStatus: String(row.issue_status ?? ""),
      originKind: String(row.origin_kind ?? ""),
      previousStatus: String(row.previous_status ?? ""),
      parkedAtMs: Number(row.parked_at_ms),
      ownerAgentId: String(row.owner_agent_id ?? ""),
      ownerAgentName: String(row.owner_agent_name ?? ""),
      ownerAgentStatus: String(row.owner_agent_status ?? ""),
      ownerQueueDepth: Number(row.owner_queue_depth ?? 0),
      newerRunForIssue: row.newer_run_for_issue === true,
      liveBlockerCount: Number(row.live_blocker_count ?? 0),
      hasUnblockDescriptor: row.has_unblock_descriptor === true,
      pendingCardCount: Number(row.pending_card_count ?? 0),
      otherActiveActionCause: String(row.other_active_action_cause ?? ""),
    }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readState(statePath: string): Promise<SweepState> {
  const empty: SweepState = { restores: {}, skipKeys: [] };
  const raw = await readFile(statePath, "utf8").catch(() => null);
  if (raw === null) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<SweepState>;
    return {
      restores:
        parsed.restores && typeof parsed.restores === "object" ? { ...parsed.restores } : {},
      skipKeys: Array.isArray(parsed.skipKeys) ? parsed.skipKeys.map(String) : [],
    };
  } catch {
    // A truncated state file costs at most repeated log lines and a reset restore
    // count. Every guard that matters lives in the database, not in this file.
    return empty;
  }
}

async function writeState(statePath: string, state: SweepState): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * The write. One PATCH, and the server's own response is the receipt: it re-derives
 * status, so a write it declined comes back as something other than what we asked
 * for rather than as an error (`phantom-block-sweep.sh`, LAC-4910).
 *
 * Never throws: one unreachable API must not skip the rest of the batch.
 */
async function restoreIssue(
  apiBase: string,
  apiKey: string | undefined,
  park: StrandedPark
): Promise<{ status: string } | { error: string }> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(`${apiBase}/issues/${park.issueId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: RESTORE_STATUS }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const issue = (body?.issue ?? body) as { status?: unknown } | null;
    const status = typeof issue?.status === "string" ? issue.status : "";
    if (!status) return { error: "the server accepted the PATCH but reported no status" };
    return { status };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

function readFlagValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const statePath = (() => {
    const given = readFlagValue(argv, "--state");
    return given ? path.resolve(given) : DEFAULT_STATE_PATH;
  })();

  const url = process.env.PAPERCLIP_DB_URL;
  if (!url) {
    console.error("PAPERCLIP_DB_URL must be set (postgres://... for the Paperclip control plane)");
    process.exit(2);
  }
  const apiBase = (process.env.STRAND_RESTORE_API ?? "http://localhost:3100/api").replace(
    /\/$/,
    ""
  );
  // Board mode on localhost needs no bearer token. Off zero, a LAC agent key is
  // read from the environment and sent instead.
  const apiKey = process.env.STRAND_RESTORE_API_KEY;

  let parks: StrandedPark[];
  try {
    parks = await readParks(url);
  } catch (error) {
    // Exit 2, not 1. "Could not look" must never be logged as "nothing to restore".
    console.error(`could not read the Paperclip database: ${(error as Error).message}`);
    process.exit(2);
  }

  if (parks.length === 0) process.exit(0);

  const now = Date.now();
  const stamp = new Date(now).toISOString().replace(/\.\d+Z$/, "Z");
  const state = await readState(statePath);
  const seenSkips = new Set(state.skipKeys);
  const newSkipKeys: string[] = [];
  const restoredAgentIds = new Set<string>();
  let restoredThisPass = 0;
  let failures = 0;

  for (const park of parks) {
    const decision = decide(park, now, {
      priorRestores: state.restores[park.issueId]?.count ?? 0,
      restoredAgentIds,
      restoredThisPass,
    });

    if (decision.action === "skip") {
      const key = skipKey(park, decision.reason, now);
      // A dry run never records the marker, so diagnosing cannot mute the live
      // sweep's first real log line for the same skip.
      if (!seenSkips.has(key)) {
        console.log(`${stamp} SKIP ${describe(park)}: ${decision.detail}`);
        if (!dryRun) newSkipKeys.push(key);
      }
      continue;
    }

    if (dryRun) {
      // Counted here too, so a dry run reports the decisions a live pass would
      // actually make rather than one restore per agent too many.
      restoredAgentIds.add(park.ownerAgentId);
      restoredThisPass += 1;
      console.log(
        `${stamp} DRY-RUN would restore ${describe(park)} to ${RESTORE_STATUS} ` +
          `(parked ${formatAge(park.parkedAtMs, now)} ago from ${park.previousStatus})`
      );
      continue;
    }

    const result = await restoreIssue(apiBase, apiKey, park);
    if ("error" in result) {
      // Deliberately not counted: nothing was written, so the owner is no busier
      // than before and the next park in this pass is still fair game.
      failures += 1;
      console.error(`${stamp} ERROR restoring ${describe(park)}: ${result.error}`);
      continue;
    }
    if (result.status !== RESTORE_STATUS) {
      // The server re-derived something else, so the park is not ours to clear.
      // Counted as a failure so the launchd log says which cycle found out.
      failures += 1;
      console.error(
        `${stamp} DECLINED ${describe(park)}: asked for ${RESTORE_STATUS}, ` +
          `server reports ${result.status}`
      );
      continue;
    }

    restoredAgentIds.add(park.ownerAgentId);
    restoredThisPass += 1;
    const prior = state.restores[park.issueId]?.count ?? 0;
    state.restores[park.issueId] = { count: prior + 1, lastAtMs: now };
    console.log(
      `${stamp} RESTORED ${describe(park)} to ${RESTORE_STATUS} ` +
        `(parked ${formatAge(park.parkedAtMs, now)} ago from ${park.previousStatus}, ` +
        `attempt ${prior + 1} of ${MAX_RESTORES_PER_ISSUE})`
    );
  }

  if (!dryRun && (newSkipKeys.length > 0 || restoredThisPass > 0)) {
    await writeState(
      statePath,
      pruneState({ restores: state.restores, skipKeys: [...state.skipKeys, ...newSkipKeys] }, now)
    );
  }

  // A park this could not write is still parked, and the stranded watch reports it.
  // Exit 1 so the launchd log says which cycle gave up on it.
  process.exit(failures > 0 ? 1 : 0);
}

// Guarded so the pure helpers above can be imported by tests without touching
// Postgres, the filesystem or the API.
if (import.meta.main) {
  main().catch((error) => {
    console.error("strand restore failed:", error);
    process.exit(2);
  });
}
