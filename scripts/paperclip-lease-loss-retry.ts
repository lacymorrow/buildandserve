#!/usr/bin/env bun
/**
 * Re-runs the work the laptop killed while it slept (LAC-4586).
 *
 * When this machine sleeps, the Paperclip server process is suspended and every
 * in-flight run loses its controller lease. On wake the runs are reaped with
 * `setup_failed: Legacy controller lease lost`, and the recovery service parks
 * each orphaned issue in `blocked` under a recovery action it owns on behalf of
 * the board. That action is never delivered: `ownerType` falls to `"board"` when
 * no agent owner resolves, and the wake enqueuer returns on its first line when
 * there is no owner agent. No wake, no message, no retry.
 *
 * Measured over the 7 days to 2026-10-16: 12 of 57 routine slots stranded (21%)
 * against 15 of 308 manual issues (4.9%), and 15 of the 18 `setup_failed` runs
 * in 14 days carried this exact error string. Two of them are the head of this
 * chain: LAC-4564 (Doug store watch, started 04:00, reaped 05:29, the 9.5h blind
 * window in LAC-4568) and LAC-4565 (Lacy's 06:30 daily plan, reaped at 07:31).
 * The daily-plan routine lost 3 of 7 slots that way.
 *
 * A lease-loss reap is infrastructure, not a work failure. Nothing about the run
 * was wrong, and the slot is reproducible by definition, so the correct recovery
 * is to run it again. That is the only thing this file does.
 *
 * Three properties, two borrowed from the sibling checks in
 * `paperclip-stranded-watch.ts` and `doug-store-watch-freshness.ts`:
 *
 * 1. **It does not run inside Paperclip.** The thing being repaired is the thing
 *    that failed. launchd runs this and it reads Postgres directly, so a server
 *    that is still coming up cannot take its own repair down with it.
 * 2. **It never writes to an issue.** The only write is the retry the board
 *    itself uses, `POST /api/agents/:id/wakeup`, which asks the server to rebuild
 *    the original request and scope. Status PATCHes are deliberately absent: the
 *    platform re-parks several recovery classes seconds after a write, and the
 *    run restarting is what actually moves the issue.
 * 3. **It is silent.** No Slack path at all. A retry that works means the slot
 *    simply runs and Lacy hears nothing. A reap this cannot retry stays parked,
 *    and `paperclip-stranded-watch.ts` reports it inside 30 minutes. The watch
 *    stays read-only on purpose: an alarm that can break itself is a bad alarm.
 *
 * Usage:
 *   bun scripts/paperclip-lease-loss-retry.ts [--dry-run] [--state <path>]
 *
 * Exit codes: 0 = nothing to repair, or repaired. 1 = found a reap it could not
 * retry. 2 = could not look.
 *
 * Tourniquet, not a cure. The real fix is upstream: treat a lost controller lease
 * as non-terminal and retry the run, and deliver a board-owned recovery action to
 * somebody instead of filing it as a row. We are READ on `paperclipai/paperclip`
 * (LAC-4482), so the report lives at `docs/ops/upstream-lease-loss-strand.md` for
 * Lacy to file. Remove this script and its plist once the pinned prod Paperclip
 * retries a lease-loss reap, and note the removal on LAC-4586.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

/** The exact error the reaper writes. Matched literally, never by substring. */
export const LEASE_LOST_ERROR = "Legacy controller lease lost";

/**
 * Let the server's own recovery go first. Paperclip files its recovery action
 * within seconds to a couple of minutes of the reap, and on the classes where it
 * does resolve an agent owner it wakes that agent itself. Retrying inside that
 * window would race a working path.
 */
export const GRACE_MINUTES = 3;

/**
 * Past this, re-running the slot is worse than skipping it. A stale run of
 * "Lifeboard: draft daily plan" would draft yesterday's plan, and a stale store
 * watch would report a window a later slot has already covered.
 *
 * Two hours is also what replaces a per-routine supersession check. The fastest
 * routine on the board is 4-hourly, so nothing inside this window can have been
 * superseded by its own next slot, and the sweep runs every 5 minutes, so the
 * window is ample. One rule instead of two, and the stricter of the two.
 */
export const MAX_AGE_HOURS = 2;

/**
 * Split off on 2026-09-24; the real company runs on another machine. Its runs are
 * a frozen copy, so retrying them would wake agents that do not work here.
 */
const GHOST_COMPANY_ID = "6002a0d1-a96a-4495-ae4f-dd26400d9602";

/** Durable operator holds. `running` is absent: the in-flight column decides that. */
const OPERATOR_HOLD_STATUSES = new Set(["paused", "terminated", "pending_approval"]);

const TERMINAL_ISSUE_STATUSES = new Set(["done", "cancelled"]);

const DEFAULT_STATE_PATH = path.join(
  process.env.HOME ?? ".",
  ".paperclip",
  "lease-loss-retry-state.json"
);

/** One reaped run, with the result of every guard resolved in SQL. */
export interface ReapedRun {
  runId: string;
  agentId: string;
  agentName: string;
  agentStatus: string;
  identifier: string;
  title: string;
  issueStatus: string;
  originKind: string;
  diedAtMs: number;
  /** A run started on this issue after the reap. Something already resumed it. */
  newerRunForIssue: boolean;
  /** This exact run already has a retry. Ours, or the server's. */
  alreadyRetried: boolean;
  /** The agent has a queued or running run right now. */
  agentBusy: boolean;
}

export type Decision = { action: "retry" } | { action: "skip"; reason: string; detail: string };

/**
 * Decide what to do with one reaped run.
 *
 * Ordered cheapest and most permanent first, so the log reads as a reason rather
 * than a race. A run skipped for `issue_terminal` will never be retryable; one
 * skipped for `agent_busy` may well be on the next pass, and saying which is
 * which is the difference between a diagnosable miss and a silent one (LAC-4543).
 */
export function decide(
  run: ReapedRun,
  nowMs: number,
  opts: { graceMinutes?: number; maxAgeHours?: number } = {}
): Decision {
  const graceMinutes = opts.graceMinutes ?? GRACE_MINUTES;
  const maxAgeHours = opts.maxAgeHours ?? MAX_AGE_HOURS;
  const ageMs = nowMs - run.diedAtMs;

  if (!run.identifier) {
    return { action: "skip", reason: "no_issue", detail: "the run carries no issue id" };
  }
  if (TERMINAL_ISSUE_STATUSES.has(run.issueStatus)) {
    return {
      action: "skip",
      reason: "issue_terminal",
      detail: `the issue is ${run.issueStatus}, nothing to resume`,
    };
  }
  if (run.alreadyRetried) {
    return { action: "skip", reason: "already_retried", detail: "this run already has a retry" };
  }
  // Not the same test as `alreadyRetried`: a later slot, a board comment or an
  // assignment can start a fresh run on the issue without it being a retry of
  // this one. Either way the work is moving and a second wake is just noise.
  if (run.newerRunForIssue) {
    return {
      action: "skip",
      reason: "superseded",
      detail: "a later run already started on this issue",
    };
  }
  if (ageMs < graceMinutes * 60_000) {
    return {
      action: "skip",
      reason: "grace",
      detail: `reaped ${formatAge(run.diedAtMs, nowMs)} ago, inside the ${graceMinutes}m grace window`,
    };
  }
  if (ageMs > maxAgeHours * 3_600_000) {
    return {
      action: "skip",
      reason: "stale",
      detail: `reaped ${formatAge(run.diedAtMs, nowMs)} ago, past the ${maxAgeHours}h window`,
    };
  }
  if (OPERATOR_HOLD_STATUSES.has(run.agentStatus)) {
    return {
      action: "skip",
      reason: "operator_hold",
      detail: `agent status ${run.agentStatus} is an operator hold`,
    };
  }
  // Unbounded on purpose: two concurrent runs on one agent is a worse failure
  // than a visible delay, so even a stale queued row defers the retry. The next
  // pass is 5 minutes away.
  if (run.agentBusy) {
    return {
      action: "skip",
      reason: "agent_busy",
      detail: "the agent has a queued or running run",
    };
  }
  return { action: "retry" };
}

/** Hours or minutes, because "reaped 94m ago" is the number that decides this. */
export function formatAge(sinceMs: number, nowMs: number): string {
  const minutes = (nowMs - sinceMs) / 60_000;
  if (minutes < 90) return `${Math.round(minutes)}m`;
  return `${Number((minutes / 60).toFixed(1))}h`;
}

export function describe(run: ReapedRun): string {
  const where = run.originKind === "routine_execution" ? "routine slot" : "issue";
  return `${run.identifier} (${where}, ${run.agentName || "unassigned"}): ${run.title}`;
}

/**
 * One skip line per run per reason per day. A reap that keeps being skipped for
 * the same reason is one log line, not 288; a reap whose reason changes says so
 * the moment it changes.
 */
export function skipKey(run: ReapedRun, reason: string, nowMs: number): string {
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return `${run.runId}:${reason}:${day}`;
}

/**
 * Keys from today and yesterday only, so the file stays small. A dropped key can
 * at worst cost one repeated log line, which is the cheap direction to fail.
 */
export function pruneKeys(keys: string[], nowMs: number): string[] {
  const keep = new Set([
    new Date(nowMs).toISOString().slice(0, 10),
    new Date(nowMs - 86_400_000).toISOString().slice(0, 10),
  ]);
  return keys.filter((key) => keep.has(key.slice(-10))).sort();
}

const QUERY = `
  WITH reaped AS (
    SELECT r.id,
           r.agent_id,
           r.company_id,
           coalesce(r.finished_at, r.created_at) AS died_at,
           r.context_snapshot ->> 'issueId' AS issue_id
      FROM heartbeat_runs r
     WHERE r.error = $1
       AND r.company_id <> $2
       -- Bounded by the decision window itself, so an old reap is never read,
       -- let alone retried. The guard is re-applied in decide() against the
       -- caller's clock; this clause only keeps the scan small.
       AND coalesce(r.finished_at, r.created_at) > now() - ($3 || ' hours')::interval
  )
  SELECT x.id AS run_id,
         x.agent_id,
         coalesce(a.name, '') AS agent_name,
         coalesce(a.status, '') AS agent_status,
         coalesce(i.identifier, '') AS identifier,
         coalesce(i.title, '') AS title,
         coalesce(i.status, '') AS issue_status,
         coalesce(i.origin_kind, '') AS origin_kind,
         (extract(epoch FROM x.died_at) * 1000)::bigint AS died_at_ms,
         EXISTS (
           SELECT 1 FROM heartbeat_runs n
            WHERE n.context_snapshot ->> 'issueId' = x.issue_id
              AND n.id <> x.id
              AND n.created_at > x.died_at
         ) AS newer_run_for_issue,
         EXISTS (
           SELECT 1 FROM heartbeat_runs y WHERE y.retry_of_run_id = x.id
         ) AS already_retried,
         EXISTS (
           SELECT 1 FROM heartbeat_runs z
            WHERE z.agent_id = x.agent_id
              AND z.status IN ('queued', 'running')
         ) AS agent_busy
    FROM reaped x
    LEFT JOIN agents a ON a.id = x.agent_id
    LEFT JOIN issues i ON i.id::text = x.issue_id
   ORDER BY x.died_at
`;

/**
 * Read the runs straight from Postgres. The URL is required rather than defaulted
 * so this file holds no credential, and so a typo fails loudly instead of quietly
 * repairing the wrong database.
 */
async function readReapedRuns(url: string, maxAgeHours: number): Promise<ReapedRun[]> {
  // Timeouts, because a wedged database must not wedge the repair. launchd would
  // otherwise hold one hung process and skip every cycle after it.
  const sql = postgres(url, { max: 1, connect_timeout: 10, idle_timeout: 5 });
  try {
    const rows = (await sql.unsafe(QUERY, [
      LEASE_LOST_ERROR,
      GHOST_COMPANY_ID,
      String(maxAgeHours),
    ])) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      runId: String(row.run_id),
      agentId: String(row.agent_id),
      agentName: String(row.agent_name ?? ""),
      agentStatus: String(row.agent_status ?? ""),
      identifier: String(row.identifier ?? ""),
      title: String(row.title ?? ""),
      issueStatus: String(row.issue_status ?? ""),
      originKind: String(row.origin_kind ?? ""),
      diedAtMs: Number(row.died_at_ms),
      newerRunForIssue: row.newer_run_for_issue === true,
      alreadyRetried: row.already_retried === true,
      agentBusy: row.agent_busy === true,
    }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readSeenKeys(statePath: string): Promise<string[]> {
  const raw = await readFile(statePath, "utf8").catch(() => null);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as { keys?: unknown };
    return Array.isArray(parsed.keys) ? parsed.keys.map(String) : [];
  } catch {
    // A truncated state file costs repeated skip lines, never a repeated retry:
    // the retry guards all live in the database, not in this file.
    return [];
  }
}

async function writeSeenKeys(statePath: string, keys: string[]): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({ keys }, null, 2)}\n`);
}

/**
 * The board's own exact-failed-run retry. The server rebuilds the original
 * request and scope, so the new run lands back on the same issue; the reaped run
 * never reached the agent, so there is no session to resume and nothing to
 * reconcile. Same lever as `~/.paperclip/agent-maxturns-sweep.sh` (LAC-4509).
 *
 * Returns the new run id, or an error string. Never throws: one unreachable API
 * must not skip the rest of the batch.
 */
async function retryRun(
  apiBase: string,
  run: ReapedRun
): Promise<{ runId: string } | { error: string }> {
  try {
    const res = await fetch(`${apiBase}/agents/${run.agentId}/wakeup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "retry_failed_run", failedRunId: run.runId }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    if (!res.ok) return { error: `HTTP ${res.status}` };
    if (!body?.id) return { error: "the server accepted the wakeup but returned no run id" };
    return { runId: body.id };
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
  const maxAgeHours = Number(readFlagValue(argv, "--max-age-hours") ?? MAX_AGE_HOURS);
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    console.error("--max-age-hours must be a positive number");
    process.exit(2);
  }

  const url = process.env.PAPERCLIP_DB_URL;
  if (!url) {
    console.error("PAPERCLIP_DB_URL must be set (postgres://... for the Paperclip control plane)");
    process.exit(2);
  }
  const apiBase = (process.env.LEASE_LOSS_RETRY_API ?? "http://localhost:3100/api").replace(
    /\/$/,
    ""
  );

  let runs: ReapedRun[];
  try {
    runs = await readReapedRuns(url, maxAgeHours);
  } catch (error) {
    // Exit 2, not 1. "Could not look" must never be logged as "nothing to repair".
    console.error(`could not read the Paperclip database: ${(error as Error).message}`);
    process.exit(2);
  }

  if (runs.length === 0) process.exit(0);

  const now = Date.now();
  const stamp = new Date(now).toISOString().replace(/\.\d+Z$/, "Z");
  const seen = await readSeenKeys(statePath);
  const seenSet = new Set(seen);
  const newKeys: string[] = [];
  let failures = 0;

  for (const run of runs) {
    const decision = decide(run, now, { maxAgeHours });

    if (decision.action === "skip") {
      const key = skipKey(run, decision.reason, now);
      // A dry run never records the marker, so diagnosing cannot mute the live
      // sweep's first real log line for the same skip.
      if (!seenSet.has(key)) {
        console.log(`${stamp} SKIP ${describe(run)}: ${decision.detail}`);
        if (!dryRun) newKeys.push(key);
      }
      continue;
    }

    if (dryRun) {
      console.log(`${stamp} DRY-RUN would retry ${describe(run)} via run ${run.runId}`);
      continue;
    }

    const result = await retryRun(apiBase, run);
    if ("error" in result) {
      failures += 1;
      console.error(
        `${stamp} ERROR retrying ${describe(run)} via run ${run.runId}: ${result.error}`
      );
      continue;
    }
    console.log(
      `${stamp} RETRIED ${describe(run)}: reaped run ${run.runId} -> ${result.runId} ` +
        `(lease lost ${formatAge(run.diedAtMs, now)} ago)`
    );
  }

  if (!dryRun && newKeys.length > 0) {
    await writeSeenKeys(statePath, pruneKeys([...seen, ...newKeys], now));
  }

  // A reap this could not retry is still parked, and the stranded watch reports
  // it. Exit 1 so the launchd log says which cycle gave up on it.
  process.exit(failures > 0 ? 1 : 0);
}

// Guarded so the pure helpers above can be imported by tests without touching
// Postgres, the filesystem or the API.
if (import.meta.main) {
  main().catch((error) => {
    console.error("lease loss retry failed:", error);
    process.exit(2);
  });
}
